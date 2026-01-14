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
