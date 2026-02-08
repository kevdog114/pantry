
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
                status: 'RUNNING',
                startedAt: new Date()
            }
        });

        const io = req.app.get("io");
        if (io) {
            io.emit('timers_updated');
        }

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

        const io = req.app.get("io");
        if (io) {
            io.emit('timers_updated');
        }

        res.json({ message: "success" });
    } catch (error) {
        console.error("Error deleting timer:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const extendTimer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { seconds } = req.body;

        const timer = await prisma.timer.findUnique({ where: { id: Number(id) } });
        if (!timer) {
            return res.status(404).json({ message: "Timer not found" });
        }

        const updatedTimer = await prisma.timer.update({
            where: { id: Number(id) },
            data: {
                duration: timer.duration + Number(seconds)
            }
        });

        const io = req.app.get("io");
        if (io) {
            io.emit('timers_updated');
        }

        res.json({ message: "success", data: updatedTimer });
    } catch (error) {
        console.error("Error extending timer:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const restartTimer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const updatedTimer = await prisma.timer.update({
            where: { id: Number(id) },
            data: {
                startedAt: new Date(),
                status: 'RUNNING'
            }
        });

        const io = req.app.get("io");
        if (io) {
            io.emit('timers_updated');
        }

        res.json({ message: "success", data: updatedTimer });
    } catch (error) {
        console.error("Error restarting timer:", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};
