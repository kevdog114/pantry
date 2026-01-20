import { Request, Response } from "express";
import prisma from "../lib/prisma";
import crypto from 'crypto';

export const generateToken = async (req: Request, res: Response) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
        await prisma.kioskToken.create({
            data: {
                token,
                expiresAt
            }
        });

        // Use request host to build URL
        const protocol = req.protocol;
        const host = req.get('host');
        // If host is API port (4300), we might want UI port (4200). 
        // Assuming typical dev setup: localhost:4200.
        // But better to use referer or env.
        const origin = req.get('origin') || process.env.APP_URL || 'http://localhost:4200';

        res.json({ token, url: `${origin}/kiosk/link?token=${token}` });
    } catch (error) {
        console.error("Error generating kiosk token:", error);
        res.status(500).json({ message: "Failed to generate token" });
    }
};

export const linkKiosk = async (req: Request, res: Response) => {
    try {
        const { token, name } = req.body;
        const userId = (req.user as any).id;

        const kioskToken = await prisma.kioskToken.findUnique({
            where: { token }
        });

        if (!kioskToken || kioskToken.expiresAt < new Date()) {
            res.status(400).json({ message: "Invalid or expired token" });
            return;
        }

        // Create Kiosk
        const kiosk = await prisma.kiosk.create({
            data: {
                userId,
                name: name || "Kiosk Device",
            }
        });

        // Notify Kiosk via Socket
        const io = req.app.get("io");
        if (io) {
            const pat = await prisma.personalAccessToken.create({
                data: {
                    userId,
                    token: crypto.randomBytes(32).toString('hex'),
                    description: `Kiosk Login - ${kiosk.name}`
                }
            });

            console.log(`Emitting kiosk_linked to room kiosk_${token}`);
            io.to(`kiosk_${token}`).emit("kiosk_linked", {
                success: true,
                kioskId: kiosk.id,
                kioskName: kiosk.name,
                authToken: pat.token
            });
        }

        // Cleanup
        await prisma.kioskToken.delete({ where: { id: kioskToken.id } });

        res.json({ success: true, kiosk });
    } catch (error) {
        console.error("Error linking kiosk:", error);
        res.status(500).json({ message: "Failed to link kiosk" });
    }
};

export const getKiosks = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any).id;
        const kiosks = await prisma.kiosk.findMany({
            where: { userId },
            include: { devices: true },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`getKiosks for user ${userId} found ${kiosks.length} results`);
        res.json(kiosks);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch kiosks" });
    }
};

export const kioskLogin = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ message: "Token required" });
            return;
        }

        const pat = await prisma.personalAccessToken.findUnique({
            where: { token },
            include: { user: true }
        });

        if (!pat) {
            res.status(401).json({ message: 'Invalid token' });
            return;
        }

        req.login(pat.user, async (err) => {
            if (err) {
                res.status(500).json({ message: "Login failed" });
                return;
            }
            // Update last used
            prisma.personalAccessToken.update({
                where: { id: pat.id },
                data: { lastUsed: new Date() }
            }).catch(console.error);

            // Store kioskId in session if provided (from socket or request)
            let kioskSettings = {};
            if (req.body.kioskId) {
                (req.session as any).kioskId = req.body.kioskId;

                // Fetch settings
                try {
                    const kiosk = await prisma.kiosk.findUnique({
                        where: { id: req.body.kioskId }
                    });
                    if (kiosk) {
                        kioskSettings = {
                            hasKeyboardScanner: kiosk.hasKeyboardScanner
                        };
                    }
                } catch (e) {
                    console.error("Error fetching kiosk settings for login:", e);
                }
            }

            res.json({ success: true, user: pat.user, kioskSettings });
        });
    } catch (error) {
        console.error("Kiosk login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteKiosk = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const userId = (req.user as any).id;

        const kiosk = await prisma.kiosk.findUnique({
            where: { id }
        });

        if (!kiosk || kiosk.userId !== userId) {
            res.status(404).json({ message: "Kiosk not found" });
            return;
        }

        // Revoke associated Personal Access Tokens (Logout the kiosk)
        // We match tokens by description since we don't have a direct link in the schema yet. 
        // A robust solution would link PAT to Kiosk in DB, but parsing description works for now per implementation above.
        await prisma.personalAccessToken.deleteMany({
            where: {
                userId,
                description: `Kiosk Login - ${kiosk.name}`
            }
        });

        await prisma.kiosk.delete({
            where: { id }
        });

        res.json({ success: true, message: "Kiosk removed and logged out." });
    } catch (error) {
        console.error("Error deleting kiosk:", error);
        res.status(500).json({ message: "Failed to delete kiosk" });
    }
};

export const updateKioskSettings = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        console.log(`updateKioskSettings id=${id} body=`, req.body);
        const { hasKeyboardScanner } = req.body;
        const userId = (req.user as any).id;

        const kiosk = await prisma.kiosk.findFirst({
            where: { id, userId }
        });

        if (!kiosk) {
            res.status(404).json({ message: "Kiosk not found" });
            return;
        }

        const updatedKiosk = await prisma.kiosk.update({
            where: { id },
            data: { hasKeyboardScanner }
        });

        // Notify Kiosk to refresh settings
        const io = req.app.get("io");
        if (io) {
            console.log(`Emitting refresh_kiosk_settings to kiosk_device_${id}`);
            io.to(`kiosk_device_${id}`).emit('refresh_kiosk_settings', updatedKiosk);
        }

        res.json(updatedKiosk);
    } catch (error) {
        console.error("Error updating kiosk settings:", error);
        res.status(500).json({ message: "Failed to update kiosk settings" });
    }
};

export const updateDeviceConfig = async (req: Request, res: Response) => {
    try {
        const kioskId = parseInt(req.params.kioskId);
        const deviceId = parseInt(req.params.deviceId);
        const config = req.body; // Expects the full config object or partial updates
        const userId = (req.user as any).id;

        // Verify ownership via Kiosk
        const kiosk = await prisma.kiosk.findFirst({
            where: { id: kioskId, userId }
        });

        if (!kiosk) {
            res.status(404).json({ message: "Kiosk not found" });
            return;
        }

        const device = await prisma.hardwareDevice.findFirst({
            where: { id: deviceId, kioskId }
        });

        if (!device) {
            res.status(404).json({ message: "Device not found" });
            return;
        }

        // Parse existing details
        let details: any = {};
        try {
            details = device.details ? JSON.parse(device.details) : {};
        } catch (e) {
            details = {};
        }

        // Merge config
        details.config = { ...details.config, ...config };

        const updatedDevice = await prisma.hardwareDevice.update({
            where: { id: deviceId },
            data: { details: JSON.stringify(details) }
        });

        // Notify Kiosk
        const io = req.app.get("io");
        if (io) {
            io.to(`kiosk_device_${kioskId}`).emit('configure_device', {
                deviceId: updatedDevice.id,
                name: updatedDevice.name,
                details: details // details object with config
            });
        }

        res.json(updatedDevice);
    } catch (error) {
        console.error("Error updating device config:", error);
        res.status(500).json({ message: "Failed to update device config" });
    }
};


