import * as dotenv from "dotenv";
dotenv.config();

import app from "./app";
import prisma from './lib/prisma';
import * as crypto from "crypto";
import * as bcrypt from 'bcryptjs';

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

io.on("connection", (socket) => {
    console.log("New socket connection:", socket.id);

    socket.on("join_kiosk", (token) => {
        console.log(`Socket ${socket.id} joining kiosk room ${token}`);
        socket.join(`kiosk_${token}`);
    });

    socket.on("disconnect", () => {
        // console.log("Socket disconnected:", socket.id);
    });
});

const server = httpServer.listen(app.get("port"), async () => {
    await createDefaultAdmin();
    console.log(`App running on port ${app.get("port")}`);
});

export default server;
export { io };
