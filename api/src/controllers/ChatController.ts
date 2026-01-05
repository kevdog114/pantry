import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getSessions = async (req: Request, res: Response) => {
    try {
        const sessions = await prisma.chatSession.findMany({
            orderBy: {
                updatedAt: 'desc'
            },
            include: {
                messages: {
                    take: 1,
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        res.json({
            message: "success",
            data: sessions
        });
    } catch (error) {
        console.error("Error fetching sessions:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const getSession = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: "Invalid session ID" });
            return;
        }

        const session = await prisma.chatSession.findUnique({
            where: { id },
            include: {
                messages: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });

        if (!session) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        res.json({
            message: "success",
            data: session
        });
    } catch (error) {
        console.error("Error fetching session:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const deleteSession = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: "Invalid session ID" });
            return;
        }

        await prisma.chatSession.delete({
            where: { id }
        });

        res.json({
            message: "success"
        });
    } catch (error) {
        console.error("Error deleting session:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};
