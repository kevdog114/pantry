import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const search = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    const query = req.query.q as string;
    
    const products = await prisma.product.findMany({
        where: {
            title: {
                contains: query
            }
        },
        include: {
            stockItems: true,
            files: true,
            barcodes: {
                include: {
                    tags: true
                }
            },
            tags: true
        }
    });

    res.send(products);
}

export const getall = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    const products = await prisma.product.findMany({
        include: {
            stockItems: true,
            files: true,
            barcodes: {
                include: {
                    tags: true
                }
            },
            tags: true
        }
    });

    res.send(products);
}