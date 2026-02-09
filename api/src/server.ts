import * as dotenv from "dotenv";
dotenv.config();

import * as net from 'net';

import app from "./app";
import prisma from './lib/prisma';
import * as crypto from "crypto";
import * as bcrypt from 'bcryptjs';
import * as cron from 'node-cron';
import { WeatherService } from './services/WeatherService';
import mqttService from './services/MqttService';

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

// Handle WebSocket upgrade for noVNC proxy
import * as PlaywrightProxyController from './controllers/PlaywrightProxyController';
httpServer.on('upgrade', (req, socket, head) => {
    // Only proxy WebSocket requests to /playwright/vnc/websockify
    if (req.url?.startsWith('/playwright/vnc/websockify')) {
        PlaywrightProxyController.proxyNoVncWebSocket(req, socket, head);
    } else {
        // Let Socket.IO handle its own upgrade requests
        // Socket.IO will handle this internally
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
            const barcode = data.barcode || '';
            const barcodeType = mqttService.determineBarcodeType(barcode);
            console.log(`Received barcode_scan from Kiosk ${kioskId}: ${barcode} (Type: ${barcodeType})`);

            // Publish ALL barcode scans to MQTT (if configured)
            mqttService.publishBarcodeScan(kioskId, barcode, barcodeType);

            // HA: prefixed barcodes are MQTT-only — do not forward to clients
            if (barcodeType === 'HomeAssistant') {
                console.log(`HA barcode consumed by MQTT, not forwarding to clients`);
                return;
            }

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

        const username = pat?.user?.username || 'Unknown User';
        console.log(`User ${username} requested scale weight for Kiosk ${targetKioskId}`);

        if (requestId) {
            scaleRequests.set(requestId, socket.id);
            // Auto cleanup after 30 seconds
            setTimeout(() => scaleRequests.delete(requestId), 30000);
        }

        console.log(`Routing read_scale to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('read_scale', data);
    });

    socket.on("tare_scale", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing tare_scale to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('tare_scale', data);
    });

    socket.on("calibrate_scale", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing calibrate_scale to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('calibrate_scale', data);
    });

    socket.on("scale_reading", (data) => {
        // Bridge reporting weight
        if (kioskId) {
            console.log(`Received scale_reading from Kiosk ${kioskId}`, data); // Verbose

            const requestId = data.requestId;

            if (requestId === 'poll') {
                // Broadcast to all (UI)
                io.to(`kiosk_device_${kioskId}`).emit('scale_reading', data);
            } else {
                const requesterSocketId = scaleRequests.get(requestId);
                if (requesterSocketId) {
                    io.to(requesterSocketId).emit('scale_reading', data);
                    scaleRequests.delete(requestId);
                } else {
                    // Fallback to room
                    io.to(`kiosk_device_${kioskId}`).emit('scale_reading', data);
                }
            }
        }
    });

    socket.on("tare_complete", (data) => {
        if (kioskId) {
            console.log(`Received tare_complete from Kiosk ${kioskId}`, data);
            io.to(`kiosk_device_${kioskId}`).emit('tare_complete', data);
        }
    });

    socket.on("calibration_complete", (data) => {
        if (kioskId) {
            console.log(`Received calibration_complete from Kiosk ${kioskId}`, data);
            io.to(`kiosk_device_${kioskId}`).emit('calibration_complete', data);
        }
    });

    // Flashing / Serial Ports
    socket.on("get_serial_ports", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing get_serial_ports to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('get_serial_ports', data);
    });

    socket.on("serial_ports_list", (data) => {
        // Fallback to data.requestId or infer routing if needed, but primarily use socket.kioskId
        const sourceKioskId = kioskId || (data.kioskId); // Bridge might not send kioskId in data, but socket should have it.

        if (sourceKioskId) {
            console.log(`Received serial_ports_list from Kiosk ${sourceKioskId}`, JSON.stringify(data));
            io.to(`kiosk_device_${sourceKioskId}`).emit('serial_ports_list', data);
        } else {
            console.warn(`Received serial_ports_list from unknown socket ${socket.id}`, data);
        }
    });


    socket.on("flash_firmware", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing flash_firmware to Kiosk ${targetKioskId}`, data);
        io.to(`kiosk_device_${targetKioskId}`).emit('flash_firmware', data);
    });

    socket.on("flash_complete", (data) => {
        const sourceKioskId = kioskId || (data.kioskId);
        if (sourceKioskId) {
            console.log(`Received flash_complete from Kiosk ${sourceKioskId}`, data);
            io.to(`kiosk_device_${sourceKioskId}`).emit('flash_complete', data);
        } else {
            console.warn(`Received flash_complete from unknown socket`, data);
        }
    });

    // SIP Bridging
    socket.on("sip_get_config", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing sip_get_config to Kiosk ${targetKioskId}`);
        io.to(`kiosk_device_${targetKioskId}`).emit('sip_get_config', data);
    });

    socket.on("sip_config", (data) => {
        if (kioskId) {
            io.to(`kiosk_device_${kioskId}`).emit('sip_config', data);
        }
    });

    socket.on("sip_configure", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing sip_configure to Kiosk ${targetKioskId}`);
        io.to(`kiosk_device_${targetKioskId}`).emit('sip_configure', data.config);
    });

    socket.on("sip_dial", (data) => {
        const targetKioskId = data.kioskId;
        console.log(`Routing sip_dial to Kiosk ${targetKioskId}`);
        io.to(`kiosk_device_${targetKioskId}`).emit('sip_dial', data);
    });

    socket.on("sip_hangup", (data) => {
        const targetKioskId = data.kioskId;
        io.to(`kiosk_device_${targetKioskId}`).emit('sip_hangup', data);
    });

    socket.on("sip_answer", (data) => {
        const targetKioskId = data.kioskId;
        io.to(`kiosk_device_${targetKioskId}`).emit('sip_answer', data);
    });

    socket.on("sip_incoming_call", (data) => {
        if (kioskId) {
            io.to(`kiosk_device_${kioskId}`).emit('sip_incoming_call', data);
        }
    });

    socket.on("sip_call_state", (data) => {
        if (kioskId) {
            io.to(`kiosk_device_${kioskId}`).emit('sip_call_state', data);
        }
    });

    socket.on("sip_reg_state", (data) => {
        if (kioskId) {
            io.to(`kiosk_device_${kioskId}`).emit('sip_reg_state', data);
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

        // Cleanup speech client if exists
        // (Managed in speech handlers below or via closure variable if we move it up)
        // Since we are adding speech handlers in this scope, let's clean them up here.
        // But we need reference to speechClient.
        // We will define speechClient variable at the top of the connection scope.
    });

    // Speech Streaming Handlers
    let speechClient: net.Socket | null = null;
    let whisperBuffer = '';
    let whisperState: 'LINE' | 'PAYLOAD' = 'LINE';
    let whisperPayloadLength = 0;

    socket.on("speech_start", () => {
        console.log(`Socket ${socket.id} starting speech stream`);
        if (speechClient) {
            speechClient.destroy();
        }

        speechClient = new net.Socket();

        const WHISPER_HOST = process.env.WHISPER_HOST || 'localhost';
        const WHISPER_PORT = parseInt(process.env.WHISPER_PORT || '10300', 10);

        speechClient.connect(WHISPER_PORT, WHISPER_HOST, () => {
            console.log(`Socket ${socket.id} connected to Whisper`);
            // Send Audio Start
            const startMsg = JSON.stringify({
                type: 'audio-start',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1
                }
            }) + '\n';
            speechClient?.write(startMsg);
        });

        speechClient.on('data', (data) => {
            whisperBuffer += data.toString();

            while (true) {
                if (whisperState === 'LINE') {
                    const lineEnd = whisperBuffer.indexOf('\n');
                    if (lineEnd === -1) break;
                    const line = whisperBuffer.substring(0, lineEnd);
                    whisperBuffer = whisperBuffer.substring(lineEnd + 1);
                    if (!line.trim()) continue;

                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'transcript' || msg.event === 'transcript') {
                            if (msg.data_length > 0) {
                                whisperState = 'PAYLOAD';
                                whisperPayloadLength = msg.data_length;
                            } else {
                                const text = msg.data?.text || msg.text || '';
                                // Emit partial or final text
                                socket.emit('speech_text', { text, isFinal: false });
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing Whisper message', e);
                    }
                } else if (whisperState === 'PAYLOAD') {
                    if (whisperBuffer.length >= whisperPayloadLength) {
                        const payload = whisperBuffer.substring(0, whisperPayloadLength);
                        whisperBuffer = whisperBuffer.substring(whisperPayloadLength);
                        whisperState = 'LINE';

                        let text = payload;
                        try {
                            const p = JSON.parse(payload);
                            if (p.text) text = p.text;
                        } catch (e) { }

                        socket.emit('speech_text', { text, isFinal: false });
                    } else {
                        break;
                    }
                }
            }
        });

        speechClient.on('error', (err) => {
            console.error('Whisper socket error', err);
            socket.emit('speech_error', { error: err.message });
        });

        // Ensure cleanup on socket disconnect
        socket.on("disconnect", () => {
            if (speechClient) {
                speechClient.destroy();
                speechClient = null;
            }
        });
    });

    socket.on("speech_data", (chunk: any) => {
        if (speechClient && !speechClient.destroyed) {
            // Buffer comes as generic data, ensure it is buffer
            // Socket.io handles binary as buffer usually

            // Send Audio Chunk
            const chunkHeader = JSON.stringify({
                type: 'audio-chunk',
                data: {
                    rate: 16000,
                    width: 2,
                    channels: 1
                },
                payload_length: (chunk as Buffer).length
            }) + '\n';
            speechClient.write(chunkHeader);
            speechClient.write(chunk as Buffer);
        }
    });

    socket.on("speech_stop", () => {
        if (speechClient && !speechClient.destroyed) {
            const stopMsg = JSON.stringify({
                type: 'audio-stop'
            }) + '\n';
            speechClient.write(stopMsg);

            // Allow some time for final response
            setTimeout(() => {
                if (speechClient && !speechClient.destroyed) {
                    speechClient.end();
                }
            }, 2000);
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
