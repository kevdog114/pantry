import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const tag = await prisma.tag.findUnique({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send(tag);
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const tags = await prisma.tag.findMany({
        include: {
            _count: {
                select: { barcodes: true }
            }
        }
    });
    res.send(tags);
}

export const getAllForGroup = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const tags = await prisma.tag.findMany({
        where: {
            group: req.params.group
        }
    });
    res.send(tags);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const tag = await prisma.tag.create({
        data: {
            name: req.body.name,
            group: req.body.group
        }
    });
    res.send(tag);
}

export const updateById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const tag = await prisma.tag.update({
        where: {
            id: parseInt(req.params.id)
        },
        data: {
            name: req.body.name
        }
    });
    res.send(tag);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    await prisma.tag.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send({ success: true });
}

export const getGroups = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send([
        { code: "location", display: "Location" },
        { code: "category", display: "Category" }
    ]);
}
