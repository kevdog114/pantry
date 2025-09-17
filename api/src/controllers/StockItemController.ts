import { NextFunction, Request, Response } from "express";
import prisma from '../lib/prisma';

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    await prisma.stockItem.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
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
    const stockItem = await prisma.stockItem.update({
        where: {
            id: parseInt(req.params.id)
        },
        data: {
            expirationDate: req.body.expiration ? new Date(req.body.expiration) : undefined,
            quantity: req.body.quantity,
            frozen: req.body.isFrozen,
            opened: req.body.isOpened
        }
    });
    res.send(stockItem);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const stockItem = await prisma.stockItem.create({
        data: {
            productId: req.body.ProductId,
            expirationDate: req.body.expiration ? new Date(req.body.expiration) : undefined,
            quantity: req.body.quantity,
            frozen: req.body.isFrozen,
            opened: req.body.isOpened
        }
    });
    res.send(stockItem);
}