import { Request, Response } from "express";
import { Server } from "socket.io";

export const getConnectedClients = async (req: Request, res: Response) => {
    try {
        const io: Server = req.app.get("io");

        if (!io) {
            throw new Error("Socket.io instance not found on app");
        }

        const sockets = Array.from(io.sockets.sockets.values());
        const clients = sockets.map(s => {
            const sAny = s as any;
            return {
                id: s.id,
                transport: sAny.conn?.transport?.name || sAny.client?.conn?.transport?.name || 'unknown',
                ip: s.handshake.address,
                userAgent: s.handshake.headers['user-agent'],
                connectedAt: s.handshake.time,
                kioskId: sAny.kioskId,
                user: sAny.pat?.user?.username,
                description: sAny.pat?.description
            };
        });

        res.json(clients);
    } catch (error) {
        console.error("Error fetching connected clients:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const logMessage = async (req: Request, res: Response) => {
    const { level, message, details } = req.body;
    console.log(`[CLIENT-LOG] [${level || 'INFO'}] ${message}`, details ? JSON.stringify(details) : '');
    res.sendStatus(200);
};
