import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getShoppingTrips = async (req: Request, res: Response): Promise<void> => {
    try {
        const { startDate, endDate } = req.query;
        let where = {};
        if (startDate && endDate) {
            where = {
                date: {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                }
            };
        }

        const trips = await prisma.shoppingTrip.findMany({
            where,
            include: {
                items: true
            },
            orderBy: {
                date: 'asc'
            }
        });
        res.json(trips);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createShoppingTrip = async (req: Request, res: Response): Promise<void> => {
    try {
        const { date, notes } = req.body;
        if (!date) {
            res.status(400).json({ error: "Date is required" });
            return;
        }

        const trip = await prisma.shoppingTrip.create({
            data: {
                date: new Date(date),
                notes: notes
            }
        });
        res.json(trip);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateShoppingTrip = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { date, notes } = req.body;

        const trip = await prisma.shoppingTrip.update({
            where: { id: parseInt(id) },
            data: {
                date: date ? new Date(date) : undefined,
                notes: notes !== undefined ? notes : undefined
            }
        });
        res.json(trip);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteShoppingTrip = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await prisma.shoppingTrip.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: "Deleted" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const assignItemsToTrip = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { itemIds } = req.body; // Array of ShoppingListItem IDs

        if (!itemIds || !Array.isArray(itemIds)) {
            res.status(400).json({ error: "itemIds must be an array" });
            return;
        }

        // Unassign items first if we want to handle transfers, but just setting is fine
        // Update items
        await prisma.shoppingListItem.updateMany({
            where: { id: { in: itemIds } },
            data: { shoppingTripId: parseInt(id) }
        });

        res.json({ message: "Items assigned" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
