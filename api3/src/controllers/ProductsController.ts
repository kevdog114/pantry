import { NextFunction, Response, Request } from "express";
import { db } from "../../models"

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    //res.send("Hello");
    res.send(await db.Products.findByPk(req.params.id));
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send(await db.Products.create({
        title: "Test product"
    }));
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send(await db.Products.findAndCountAll());
    //res.send("get all");
}