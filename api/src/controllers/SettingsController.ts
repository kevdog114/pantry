import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getSettings = async (req: Request, res: Response) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        // Convert array of objects to a single object map for easier frontend consumption
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {} as Record<string, string>);

        res.json({
            message: "success",
            data: settingsMap
        });
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const updateSettings = async (req: Request, res: Response) => {
    try {
        const settings = req.body as Record<string, string>;

        // Upsert each setting
        const promises = Object.entries(settings).map(([key, value]) => {
            return prisma.systemSetting.upsert({
                where: { key },
                update: { value },
                create: { key, value }
            });
        });

        await Promise.all(promises);

        res.json({
            message: "success"
        });
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};
