import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const location = await prisma.location.findUnique({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send(location);
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const locations = await prisma.location.findMany({
        include: {
            _count: {
                select: { stockItems: true }
            }
        }
    });
    res.send(locations);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const location = await prisma.location.create({
        data: {
            name: req.body.name,
            description: req.body.description
        }
    });
    res.send(location);
}

export const updateById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const location = await prisma.location.update({
        where: {
            id: parseInt(req.params.id)
        },
        data: {
            name: req.body.name,
            description: req.body.description
        }
    });
    res.send(location);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    await prisma.location.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send({ success: true });
}
