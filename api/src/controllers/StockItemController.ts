import { NextFunction, Request, Response } from "express";
import prisma from '../lib/prisma';

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const id = parseInt(req.params.id);
    // Determine if we need to cleanup product
    const item = await prisma.stockItem.findUnique({
        where: { id },
        include: { product: true }
    });

    if (item) {
        await prisma.stockItem.delete({
            where: { id }
        });

        // Cleanup leftover product if empty
        if (item.product.isLeftover) {
            const count = await prisma.stockItem.count({
                where: { productId: item.productId }
            });
            if (count === 0) {
                await prisma.product.delete({
                    where: { id: item.productId }
                });
            }
        }
    }
    res.send({});
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const stockItem = await prisma.stockItem.findUnique({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send(stockItem);
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const id = parseInt(req.params.id);

    // Check if we are updating quantity to 0
    if (req.body.quantity !== undefined && req.body.quantity <= 0) {
        const item = await prisma.stockItem.findUnique({
            where: { id },
            include: { product: true }
        });

        if (item) {
            await prisma.stockItem.delete({
                where: { id }
            });

            // Cleanup leftover product if empty
            if (item.product.isLeftover) {
                const count = await prisma.stockItem.count({
                    where: { productId: item.productId }
                });
                if (count === 0) {
                    await prisma.product.delete({
                        where: { id: item.productId }
                    });
                }
            }
        }
        res.send({});
        return;
    }

    // Check for frozen toggle to set date
    let frozenDateOperation = {};
    if (req.body.frozen !== undefined) {
        if (req.body.frozen) {
            // Check if already frozen to avoid overwriting date?
            // Expensive to fetch just for this? Let's fetch.
            const current = await prisma.stockItem.findUnique({ where: { id }, select: { frozen: true, frozenDate: true } });
            if (current && !current.frozen) {
                // Was not frozen, now is -> set date
                frozenDateOperation = { frozenDate: new Date() };
            }
        } else {
            // Unfreezing -> clear date
            frozenDateOperation = { frozenDate: null };
        }
    }

    const stockItem = await prisma.stockItem.update({
        where: {
            id
        },
        data: {
            expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined,
            quantity: req.body.quantity,
            frozen: req.body.frozen,
            opened: req.body.opened,
            openedDate: req.body.openedDate ? new Date(req.body.openedDate) : undefined,
            ...frozenDateOperation,
            unit: req.body.unit,
            locationId: req.body.locationId
        }
    });
    res.send(stockItem);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const productId = req.body.productId;
        const expirationDate = req.body.expirationDate ? new Date(req.body.expirationDate) : null;
        const frozen = !!req.body.frozen;
        const opened = !!req.body.opened;
        const unit = req.body.unit || null;
        const locationId = req.body.locationId || null;
        const quantityToAdd = req.body.quantity || 1;

        // Check for existing stock item with same properties
        const existingItem = await prisma.stockItem.findFirst({
            where: {
                productId,
                expirationDate,
                frozen,
                opened,
                unit,
                locationId
            }
        });

        if (existingItem) {
            const updatedItem = await prisma.stockItem.update({
                where: { id: existingItem.id },
                data: {
                    quantity: existingItem.quantity + quantityToAdd
                }
            });
            res.send(updatedItem);
            return;
        }

        const stockItem = await prisma.stockItem.create({
            data: {
                productId,
                expirationDate: expirationDate || undefined, // undefined to let Prisma handle null if strictly needed, though null usually works for nullable fields
                // Wait, if expirationDate is null, passing null to nullable field is fine. 
                // Passing undefined excludes it from the query (uses default if any, or null).
                // In prisma create, undefined usually means "skipped".
                // I'll use the original logic for create data construction to be safe, or just use what I parsed.
                // original: expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined
                // My parsed: Date object or null.
                // Passing null to valid Date? field in Prisma works.
                quantity: req.body.quantity,
                frozen: req.body.frozen,
                opened: req.body.opened,
                unit: req.body.unit,
                locationId: req.body.locationId
            }
        });
        res.send(stockItem);
    } catch (error) {
        console.error("Error creating/updating stock item:", error);
        res.status(500).json({ message: "Failed to create or update stock item" });
    }
}