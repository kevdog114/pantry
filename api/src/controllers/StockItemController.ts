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
    const stockItem = await prisma.stockItem.create({
        data: {
            productId: req.body.productId,
            expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined,
            quantity: req.body.quantity,
            frozen: req.body.frozen,
            opened: req.body.opened,
            unit: req.body.unit,
            locationId: req.body.locationId
        }
    });
    res.send(stockItem);
}