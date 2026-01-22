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
                (socket as any).clientType = socket.handshake.query.clientType;

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

const scannerClaims = new Map<number, string>();
const scaleRequests = new Map<string, string>(); // requestId -> socketId

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

    socket.on("bind_to_kiosk", async (kioskId) => {
        if (!pat) return;
        console.log(`Socket ${socket.id} requesting bind to kiosk ${kioskId}`);
        try {
            // Check if user owns the kiosk
            const kiosk = await prisma.kiosk.findFirst({
                where: {
                    id: kioskId,
                    userId: pat.userId
                }
            });

            if (kiosk) {
                const room = `kiosk_device_${kiosk.id}`;
                console.log(`Socket ${socket.id} binding to room ${room}`);
                socket.join(room);
            } else {
                console.warn(`Socket ${socket.id} failed to bind to kiosk ${kioskId}: Not found or unauthorized`);
            }
        } catch (e) {
            console.error("Error binding to kiosk", e);
        }
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

    // Track scanner claims: KioskId -> SocketId
    // Moving this map outside connection handler would be better if we want persistence across connections, but for now passing it in or scoping it globally.
    // Actually, declaring it outside is better. But since I am editing the file, I will add it at top level if possible, or right here.
    // Using a file-level variable is safest if I can't edit top of file easily. But I can access top context.
    // I will put it inside connection but that resets per connection? No.
    // I will add it to `app.set` or just use a module-level variable but I can only safe edit this block.
    // I'll assume I can add it before `io.on`? No, the tool replaces inside the block usually or I replace the whole block.
    // I will replace the whole `io.on` block to encompass the variable or just start using a global declared variable (which implies I need to declare it).
    // I will declare it at the top of the file using a separate tool call first? No, replace_file_content works on chunks. 
    // I'll declare it locally in the scope of the module by adding it before `io.on` in a separate edit or just inside `server` object?
    // server.ts is an ES module.

    // Let's modify the file to add the variable at the top level first, then use it.
    // Actually, I can just modify `io.on` and assume I can place the var before it or inside `app`.
    // Let's place it on `app.locals` or just a generic var at top.

    // Wait, I can try to replace the `io.on` line to include the variable definition before it.

    socket.on("claim_scanner", async (kioskId) => {
        if (!pat) return;
        try {
            // Verify ownership
            const kiosk = await prisma.kiosk.findFirst({
                where: {
                    id: kioskId,
                    userId: pat.userId
                }
            });

            if (kiosk) {
                const currentClaimant = scannerClaims.get(kioskId);
                if (currentClaimant && currentClaimant !== socket.id) {
                    io.to(currentClaimant).emit('scanner_released');
                }

                scannerClaims.set(kioskId, socket.id);
                console.log(`Socket ${socket.id} claimed scanner for Kiosk ${kioskId}`);
                socket.emit('scanner_claimed', { success: true, kioskId });

                // Notify Kiosk and other listeners that scanner is claimed
                // We send the claimant info (obfuscated or just ID/name if available)
                io.to(`kiosk_device_${kioskId}`).emit('scanner_status_changed', {
                    claimed: true,
                    claimedBy: pat.user.username || 'Remote User'
                });
            }
        } catch (e) { console.error("Claim error", e); }
    });

    socket.on("release_scanner", (kioskId) => {
        if (scannerClaims.get(kioskId) === socket.id) {
            scannerClaims.delete(kioskId);
            console.log(`Socket ${socket.id} released scanner for Kiosk ${kioskId}`);
            socket.emit('scanner_released');

            io.to(`kiosk_device_${kioskId}`).emit('scanner_status_changed', {
                claimed: false,
                claimedBy: null
            });
        }
    });

    socket.on("get_scanner_status", async (kioskId) => {
        // Allow checking status
        const claimantSocketId = scannerClaims.get(kioskId);
        if (claimantSocketId) {
            // Find who owns it? 
            // Ideally we store more than just socketId in map, or lookup socket.
            // For now just say it is claimed.
            socket.emit('scanner_status_changed', { claimed: true, claimedBy: 'Remote User' });
        } else {
            socket.emit('scanner_status_changed', { claimed: false, claimedBy: null });
        }
    });

    socket.on("barcode_scan", (data) => {
        if (kioskId) {
            console.log(`Received barcode_scan from Kiosk ${kioskId}: ${data.barcode}`);

            const claimant = scannerClaims.get(kioskId);
            if (claimant) {
                console.log(`Routing scan to claimant ${claimant}`);
                io.to(claimant).emit("barcode_scan", data);
            } else {
                // Broadcast to all clients in the kiosk room (UI and other devices)
                io.to(`kiosk_device_${kioskId}`).emit("barcode_scan", data);
            }
        }
    });

    socket.on("read_scale", async (data) => {
        // UI Requesting Weight
        const targetKioskId = data.kioskId;
        const requestId = data.requestId;

        if (requestId) {
            scaleRequests.set(requestId, socket.id);
            // Auto cleanup after 30 seconds
            setTimeout(() => scaleRequests.delete(requestId), 30000);
        }

        console.log(`Routing read_scale to Kiosk ${targetKioskId}`, data);
        // Find the bridge socket(s) for this kiosk? 
        // We identify bridges by their 'kioskId' property which is set on connection if they are a kiosk.
        // But we didn't store them in a map explicitly, just joined 'kiosk_device_{id}' room.
        // However, if we emit to room, BOTH UI and Bridge get it. 
        // We need to differentiate or the Bridge needs to handle it and UI ignore it.
        // The Bridge listens for 'read_scale'. The UI sends it. 
        // If we emit to the room, the Bridge receives it.
        io.to(`kiosk_device_${targetKioskId}`).emit('read_scale', data);
    });

    socket.on("scale_reading", (data) => {
        // Bridge reporting weight
        if (kioskId) {
            console.log(`Received scale_reading from Kiosk ${kioskId}`, data);

            const requestId = data.requestId;
            const requesterSocketId = scaleRequests.get(requestId);

            if (requesterSocketId) {
                io.to(requesterSocketId).emit('scale_reading', data);
                scaleRequests.delete(requestId);
            } else {
                // Fallback to room
                io.to(`kiosk_device_${kioskId}`).emit('scale_reading', data);
            }
        }
    });

    // Flashing / Serial Ports
    socket.on("get_serial_ports", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing get_serial_ports to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('get_serial_ports', data);
    });

    socket.on("serial_ports_list", (data) => {
        if (kioskId) {
            console.log(`Received serial_ports_list from Kiosk ${kioskId}`);
            io.to(`kiosk_device_${kioskId}`).emit('serial_ports_list', data);
        }
    });

    socket.on("flash_firmware", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing flash_firmware to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('flash_firmware', data);
    });

    socket.on("flash_complete", (data) => {
        if (kioskId) {
            console.log(`Received flash_complete from Kiosk ${kioskId}`, data);
            io.to(`kiosk_device_${kioskId}`).emit('flash_complete', data);
        }
    });

    socket.on("disconnect", () => {
        // Remove any claims by this socket
        for (const [kId, sId] of scannerClaims.entries()) {
            if (sId === socket.id) {
                scannerClaims.delete(kId);
                console.log(`Auto-releasing scanner claim for Kiosk ${kId} due to disconnect`);
                io.to(`kiosk_device_${kId}`).emit('scanner_status_changed', {
                    claimed: false,
                    claimedBy: null
                });
            }
        }
    });
});




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
