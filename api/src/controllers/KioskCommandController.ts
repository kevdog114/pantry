import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getAll = async (req: Request, res: Response) => {
    try {
        const commands = await prisma.kioskCommand.findMany({
            orderBy: { name: 'asc' }
        });
        res.json({ message: "success", data: commands });
    } catch (error) {
        console.error("Error fetching kiosk commands", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const { name, command } = req.body;
        if (!name || !command) {
            res.status(400).json({ message: "Name and Command are required" });
            return;
        }

        const newCommand = await prisma.kioskCommand.create({
            data: { name, command }
        });
        res.json({ message: "success", data: newCommand });
    } catch (error) {
        console.error("Error creating kiosk command", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const { name, command } = req.body;

        const updated = await prisma.kioskCommand.update({
            where: { id },
            data: { name, command }
        });
        res.json({ message: "success", data: updated });
    } catch (error) {
        console.error("Error updating kiosk command", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};

export const deleteById = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.kioskCommand.delete({ where: { id } });
        res.json({ message: "success" });
    } catch (error) {
        console.error("Error deleting kiosk command", error);
        res.status(500).json({ message: "error", data: (error as Error).message });
    }
};
