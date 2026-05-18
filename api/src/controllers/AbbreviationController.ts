import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getAbbreviations = async (req: Request, res: Response) => {
    try {
        const abbreviations = await prisma.wordAbbreviation.findMany({
            orderBy: { words: 'asc' }
        });
        res.json({
            message: "success",
            data: abbreviations
        });
    } catch (error) {
        console.error("Error fetching abbreviations:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const createAbbreviation = async (req: Request, res: Response) => {
    try {
        const { words, short } = req.body;
        if (!words || !short) {
            res.status(400).json({ message: "words and short are required" });
            return;
        }
        const abbreviation = await prisma.wordAbbreviation.create({
            data: { words, short }
        });
        res.json({
            message: "success",
            data: abbreviation
        });
    } catch (error) {
        console.error("Error creating abbreviation:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const updateAbbreviation = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const { words, short } = req.body;
        const data: any = {};
        if (words !== undefined) data.words = words;
        if (short !== undefined) data.short = short;
        const abbreviation = await prisma.wordAbbreviation.update({
            where: { id },
            data
        });
        res.json({
            message: "success",
            data: abbreviation
        });
    } catch (error) {
        console.error("Error updating abbreviation:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};

export const deleteAbbreviation = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.wordAbbreviation.delete({
            where: { id }
        });
        res.json({ message: "success" });
    } catch (error) {
        console.error("Error deleting abbreviation:", error);
        res.status(500).json({
            message: "error",
            data: (error as Error).message
        });
    }
};
