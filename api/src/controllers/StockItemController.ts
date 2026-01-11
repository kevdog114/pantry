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
            expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined,
            quantity: req.body.quantity,
            frozen: req.body.frozen,
            opened: req.body.opened,
            openedDate: req.body.openedDate ? new Date(req.body.openedDate) : undefined
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
            opened: req.body.opened
        }
    });
    res.send(stockItem);
}