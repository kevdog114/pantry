import * as dotenv from "dotenv";
dotenv.config();

import app from "./app";
import prisma from './lib/prisma';
import * as crypto from "crypto";
import * as bcrypt from 'bcryptjs';
import * as cron from 'node-cron';
import { WeatherService } from './services/WeatherService';

const createDefaultAdmin = async () => {
    const users = await prisma.user.findMany();
    if (users.length === 0) {
        const password = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        await prisma.user.create({
            data: {
                username: 'admin',
                password: hashedPassword,
            }
        });
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.log("!!! NO USERS FOUND, CREATED DEFAULT ADMIN WITH PASSWORD: !!!");
        console.log(`!!! admin:${password}                                    !!!`);
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    }
};

import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.ALLOW_ORIGIN || 'http://localhost:4200',
        credentials: true
    }
});

// Store io instance in app to use in controllers if needed, or export it
app.set("io", io);

io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        try {
            console.log(`Socket ${socket.id} authenticating with token prefix ${token.substring(0, 6)}...`);
            const pat = await prisma.personalAccessToken.findUnique({
                where: { token },
                include: { user: true }
            });
            if (pat) {
                console.log(`Socket ${socket.id} authenticated as user ${pat.user.username}`);
                (socket as any).pat = pat;

                // Attempt to identify Kiosk
                if (pat.description && pat.description.startsWith('Kiosk Login - ')) {
                    const kioskName = pat.description.substring('Kiosk Login - '.length);
                    const kiosk = await prisma.kiosk.findFirst({
                        where: { userId: pat.userId, name: kioskName }
                    });
                    if (kiosk) {
                        (socket as any).kioskId = kiosk.id;
                        console.log(`Socket ${socket.id} identified as Kiosk: ${kiosk.name} (${kiosk.id})`);
                    }
                }
            } else {
                console.warn(`Socket ${socket.id} failed auth: Token invalid or expired`);
            }
        } catch (e) {
            console.error("Socket auth error", e);
        }
    } else {
        console.log(`Socket ${socket.id} connecting without auth token`);
    }
    next();
});

io.on("connection", (socket) => {
    console.log("New socket connection:", socket.id);
    const pat = (socket as any).pat;
    const kioskId = (socket as any).kioskId;

    if (kioskId) {
        const room = `kiosk_device_${kioskId}`;
        console.log(`Socket ${socket.id} joining room ${room}`);
        socket.join(room);
    }

    socket.on("join_kiosk", (token) => {
        console.log(`Socket ${socket.id} joining kiosk room ${token}`);
        socket.join(`kiosk_${token}`);
    });

    socket.on("device_register", async (data: any) => {
        console.log(`Received device_register from socket ${socket.id}`, data);
        if (!pat) {
            console.warn(`Socket ${socket.id} has no PAT attached. Ignoring device_register.`);
            return;
        }

        try {
            const desc = pat.description || '';
            console.log(`Processing device_register for PAT: ${desc}`);

            if (desc.startsWith('Kiosk Login - ')) {
                const kioskName = desc.substring('Kiosk Login - '.length);
                const kiosk = await prisma.kiosk.findFirst({
                    where: {
                        userId: pat.userId,
                        name: kioskName
                    }
                });

                if (kiosk) {
                    console.log(`Found Kiosk: ${kiosk.name} (ID: ${kiosk.id})`);
                    const existing = await prisma.hardwareDevice.findFirst({
                        where: { kioskId: kiosk.id, name: data.name }
                    });

                    if (existing) {
                        console.log(`Updating existing device ${existing.id}`);

                        let incomingDetails: any = {};
                        try { incomingDetails = JSON.parse(data.details); } catch (e) { }

                        let existingDetails: any = {};
                        try { existingDetails = existing.details ? JSON.parse(existing.details) : {}; } catch (e) { }

                        const existingConfig = existingDetails.config || {};
                        const incomingConfig = incomingDetails.config || {};

                        // Merge config: preserve DB-only settings (like sleepDelay), overwrite with hardware-detected ones
                        const mergedConfig = { ...existingConfig, ...incomingConfig };
                        incomingDetails.config = mergedConfig;

                        await prisma.hardwareDevice.update({
                            where: { id: existing.id },
                            data: {
                                status: data.status,
                                details: JSON.stringify(incomingDetails),
                                lastSeen: new Date()
                            }
                        });
                    } else {
                        console.log(`Registering new device`);
                        await prisma.hardwareDevice.create({
                            data: {
                                kioskId: kiosk.id,
                                name: data.name,
                                type: data.type,
                                status: data.status,
                                details: data.details
                            }
                        });
                    }
                } else {
                    console.warn(`Could not find kiosk with name '${kioskName}' for user ${pat.userId}`);
                }
            } else {
                console.warn(`PAT description '${desc}' does not match expected Kiosk format.`);
            }
        } catch (e) {
            console.error("Error registering device", e);
        }
    });

    socket.on("disconnect", () => {
        // console.log("Socket disconnected:", socket.id);
        const kioskData = activeKiosks.get(socket.id);
        if (kioskData) {
            console.log(`Kiosk disconnected: ${kioskData.name}`);
            activeKiosks.delete(socket.id);

            // If this kiosk was claimed, notify the claimer
            const claim = claimedScanners.get(kioskData.kioskId);
            if (claim) {
                // If the disconnected socket was the one claimed? 
                // Wait, if activeKiosks has it, it WAS the kiosk.
                // So if the kiosk disconnects, the claim is void.
                io.to(claim.claimerSocketId).emit('scanner_released');
                claimedScanners.delete(kioskData.kioskId);
            }
        }

        // If the disconnected socket was a CLAIMER
        for (const [kioskId, claim] of claimedScanners.entries()) {
            if (claim.claimerSocketId === socket.id) {
                console.log(`Claimer disconnected, releasing scanner for kiosk ${kioskId}`);
                claimedScanners.delete(kioskId);
                // Notify the kiosk
                // We need to find the kiosk socket. 
                // We can broadcast to the kiosk room
                io.to(`kiosk_device_${kioskId}`).emit('scanner_released');
            }
        }
    });

    // --- Scanner Sharing Logic ---

    // Track online Kiosks: socketId -> { kioskId, name, hasScanner }

    socket.on("identify_kiosk_scanner", async () => {
        // Called by Kiosk Frontend after login/connect if it has a scanner
        if (!kioskId && !pat) {
            console.log(`Socket ${socket.id} tried to identify as scanner but has no kioskId or PAT.`);
            return;
        }

        // If identified via PAT logic earlier
        const socketAny = socket as any;
        if (socketAny.kioskId) {
            const kId = socketAny.kioskId;
            console.log(`Checking scanner eligibility for Kiosk ${kId}...`);
            // Fetch fresh kiosk data to check 'hasKeyboardScanner'
            const kiosk = await prisma.kiosk.findUnique({ where: { id: kId } });
            if (kiosk) {
                console.log(`Kiosk ${kiosk.name} hasKeyboardScanner: ${kiosk.hasKeyboardScanner}`);
                if (kiosk.hasKeyboardScanner) {
                    console.log(`Kiosk ${kiosk.name} registered as available scanner.`);
                    activeKiosks.set(socket.id, {
                        kioskId: kId,
                        name: kiosk.name,
                        hasScanner: true
                    });
                }
            } else {
                console.warn(`Kiosk record not found for ID ${kId}`);
            }
        } else {
            console.warn(`Socket ${socket.id} has no kioskId attached.`);
        }
    });

    socket.on("get_available_scanners", (callback) => {
        const available = [];
        for (const [sId, data] of activeKiosks.entries()) {
            const isClaimed = claimedScanners.has(data.kioskId);
            if (!isClaimed) {
                available.push({
                    id: data.kioskId,
                    name: data.name
                });
            }
        }
        if (typeof callback === 'function') callback(available);
    });

    socket.on("claim_scanner", (targetKioskId: number, callback) => {
        if (!pat) return; // Auth required

        // Check if available
        let targetSocketId = null;
        for (const [sId, data] of activeKiosks.entries()) {
            if (data.kioskId == targetKioskId) {
                targetSocketId = sId;
                break;
            }
        }

        if (targetSocketId && !claimedScanners.has(targetKioskId)) {
            const claimerName = pat.user.username; // Or derive from PAT description
            claimedScanners.set(targetKioskId, {
                claimerSocketId: socket.id,
                claimerName: claimerName
            });

            // Notify Kiosk
            io.to(targetSocketId).emit('scanner_claimed', { by: claimerName });
            if (typeof callback === 'function') callback({ success: true });
            console.log(`Scanner on kiosk ${targetKioskId} claimed by ${claimerName}`);
        } else {
            if (typeof callback === 'function') callback({ success: false, error: 'Scanner not available' });
        }
    });

    socket.on("release_scanner", (targetKioskId: number) => {
        const claim = claimedScanners.get(targetKioskId);
        if (claim && claim.claimerSocketId === socket.id) {
            claimedScanners.delete(targetKioskId);
            io.to(`kiosk_device_${targetKioskId}`).emit('scanner_released');
        }
    });

    socket.on("force_release_scanner", () => {
        // Called by the KIOSK itself to break a claim
        const socketAny = socket as any;
        if (socketAny.kioskId) {
            const kId = socketAny.kioskId;
            const claim = claimedScanners.get(kId);
            if (claim) {
                console.log(`Kiosk ${kId} force released scanner from ${claim.claimerName}`);
                // Notify claimer?
                // Actually, the claimer sees 'scanner_released' logic if we implemented strictly, 
                // but simpler: just delete claim and maybe notify?
                // We should probably notify the claimer that they lost the lock.
                // But the requirement says "after the web socket connection closes, the scanner should automatically become unclaimed."
                // Force release is explicit.

                claimedScanners.delete(kId);
                // Also notify the kiosk's *own* socket (though it called this, 
                // other sockets for same kiosk might exist? No, usually 1 frontend).
                // But the Service listens for 'scanner_released', so emit to self.
                socket.emit('scanner_released');
            }
        }
    });

    socket.on("barcode_scan", (data) => {
        // Forwarding from KIOSK -> CLAIMER
        const socketAny = socket as any;
        if (socketAny.kioskId) {
            const kId = socketAny.kioskId;
            const claim = claimedScanners.get(kId);
            if (claim) {
                console.log(`Forwarding scan from ${kId} to ${claim.claimerName}: ${data.barcode}`);
                io.to(claim.claimerSocketId).emit('barcode_scan', data);
            }
        }
    });
});

// Maps for tracking state outside the connection handler
const activeKiosks = new Map<string, { kioskId: number, name: string, hasScanner: boolean }>();
const claimedScanners = new Map<number, { claimerSocketId: string, claimerName: string }>();

const server = httpServer.listen(app.get("port"), async () => {
    await createDefaultAdmin();
    console.log(`App running on port ${app.get("port")}`);

    // Initialize Weather Job
    const weatherService = new WeatherService();
    // Sync immediately on startup (will only fetch if enabled and config exists)
    weatherService.syncWeather();
    // Sync every hour
    cron.schedule('0 * * * *', () => {
        weatherService.syncWeather();
    });
});

export default server;
export { io };
