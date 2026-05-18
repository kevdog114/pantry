import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getAll = async (_req: Request, res: Response) => {
    try {
        const cookbooks = await prisma.cookbook.findMany({
            include: {
                _count: {
                    select: { recipes: true }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(cookbooks);
    } catch (error) {
        console.error("Error getting cookbooks:", error);
        res.status(500).json({ error: "Failed to get cookbooks" });
    }
};

export const getById = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const cookbook = await prisma.cookbook.findUnique({
            where: { id },
            include: {
                recipes: {
                    orderBy: { name: 'asc' }
                }
            }
        });
        if (!cookbook) {
            return res.status(404).json({ error: "Cookbook not found" });
        }
        res.json(cookbook);
    } catch (error) {
        console.error("Error getting cookbook:", error);
        res.status(500).json({ error: "Failed to get cookbook" });
    }
};

export const create = async (req: Request, res: Response) => {
    try {
        const { name, recipeIds } = req.body;
        if (!name) {
            return res.status(400).json({ error: "Name is required" });
        }

        const cookbook = await prisma.cookbook.create({
            data: {
                name,
                recipes: recipeIds && recipeIds.length > 0 ? {
                    connect: recipeIds.map((id: number) => ({ id }))
                } : undefined
            },
            include: {
                _count: {
                    select: { recipes: true }
                }
            }
        });
        res.json(cookbook);
    } catch (error) {
        console.error("Error creating cookbook:", error);
        res.status(500).json({ error: "Failed to create cookbook" });
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const { name } = req.body;

        const cookbook = await prisma.cookbook.update({
            where: { id },
            data: { name },
            include: {
                _count: {
                    select: { recipes: true }
                }
            }
        });
        res.json(cookbook);
    } catch (error) {
        console.error("Error updating cookbook:", error);
        res.status(500).json({ error: "Failed to update cookbook" });
    }
};

export const deleteById = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.cookbook.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting cookbook:", error);
        res.status(500).json({ error: "Failed to delete cookbook" });
    }
};

export const addRecipe = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const recipeId = parseInt(req.params.recipeId);

        const cookbook = await prisma.cookbook.update({
            where: { id },
            data: {
                recipes: {
                    connect: { id: recipeId }
                }
            },
            include: {
                _count: {
                    select: { recipes: true }
                }
            }
        });
        res.json(cookbook);
    } catch (error) {
        console.error("Error adding recipe to cookbook:", error);
        res.status(500).json({ error: "Failed to add recipe to cookbook" });
    }
};

export const removeRecipe = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const recipeId = parseInt(req.params.recipeId);

        const cookbook = await prisma.cookbook.update({
            where: { id },
            data: {
                recipes: {
                    disconnect: { id: recipeId }
                }
            },
            include: {
                _count: {
                    select: { recipes: true }
                }
            }
        });
        res.json(cookbook);
    } catch (error) {
        console.error("Error removing recipe from cookbook:", error);
        res.status(500).json({ error: "Failed to remove recipe from cookbook" });
    }
};
