import { NextFunction, Request, Response } from "express";
import { db } from "../../models"

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.StockItems.findByPk(req.params.id);
    if(entity != null) {
        await entity?.destroy();
        res.send({});
    }
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.StockItems.findByPk(req.params.id);
    res.send(entity);
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.StockItems.findByPk(req.params.id);
    if(entity == null)
    {
        res.sendStatus(404);
        return;
    }

    entity = await entity.update({
        expiration: req.body.expiration,
        quantity: req.body.quantity
    });

    res.send(entity);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send(await db.StockItems.create({
        ProductId: req.body.ProductId,
        expiration: req.body.expiration,
        quantity: req.body.quantity
    }));
}