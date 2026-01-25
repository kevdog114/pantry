
import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getTimers = async (req: Request, res: Response) => {
    try {
        // We might want to filter out ancient timers if we don't delete them
        const timers = await prisma.timer.findMany({
            orderBy: { startedAt: 'asc' }
        });
        res.json({ message: "success", data: timers });
    } catch (error) {
        console.error("Error fetching timers:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const createTimer = async (req: Request, res: Response) => {
    try {
        const { name, duration } = req.body;
        const timer = await prisma.timer.create({
            data: {
                name,
                duration: Number(duration),
                status: 'RUNNING'
            }
        });
        res.json({ message: "success", data: timer });
    } catch (error) {
        console.error("Error creating timer:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const deleteTimer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.timer.delete({
            where: { id: Number(id) }
        });
        res.json({ message: "success" });
    } catch (error) {
        console.error("Error deleting timer:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};
