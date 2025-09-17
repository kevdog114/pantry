import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const product = await prisma.product.findUnique({
        where: {
            id: parseInt(req.params.id)
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
    res.send(product);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const product = await prisma.product.create({
        data: {
            title: req.body.title,
            freezerLifespanDays: req.body.freezerLifespanDays,
            openedLifespanDays: req.body.openedLifespanDays,
            refrigeratorLifespanDays: req.body.refrigeratorLifespanDays,
            barcodes: {
                create: (req.body.ProductBarcodes || []).map((barcode: any) => ({
                    barcode: barcode.barcode,
                    ...(barcode.Tags && barcode.Tags.length > 0 && {
                        tags: {
                            connect: barcode.Tags.filter((t: any) => t.id > 0).map((t: any) => ({ id: t.id }))
                        }
                    })
                }))
            },
            ...(req.body.fileIds && {
                files: {
                    connect: req.body.fileIds.map((id: number) => ({ id }))
                }
            }),
            ...(req.body.tagIds && {
                tags: {
                    connect: req.body.tagIds.map((id: number) => ({ id }))
                }
            })
        },
        include: {
            barcodes: {
                include: {
                    tags: true
                }
            },
            files: true,
            tags: true
        }
    });

    res.send(product);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    await prisma.product.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send({ success: true });
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
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

export const updateById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const product = await prisma.product.update({
        where: {
            id: parseInt(req.params.id)
        },
        data: {
            title: req.body.title,
            freezerLifespanDays: req.body.freezerLifespanDays,
            openedLifespanDays: req.body.openedLifespanDays,
            refrigeratorLifespanDays: req.body.refrigeratorLifespanDays,
            ...(req.body.fileIds && {
                files: {
                    set: req.body.fileIds.map((id: number) => ({ id }))
                }
            }),
            ...(req.body.tagIds && {
                tags: {
                    set: req.body.tagIds.map((id: number) => ({ id }))
                }
            }),
            ...(req.body.barcodes && {
                barcodes: {
                    deleteMany: {},
                    create: req.body.barcodes.map((barcode: any) => ({
                        barcode: barcode.barcode,
                        ...(barcode.Tags && barcode.tags.length > 0 && {
                            tags: {
                                connect: barcode.tags.filter((t: any) => t.id > 0).map((t: any) => ({ id: t.id }))
                            }
                        })
                    }))
                }
            })
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
    res.send(product);
}

export const searchProductByBarcode = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const barcode = req.query.barcode as string;
    if (!barcode) {
        res.status(400).send({ error: 'Barcode is required' });
        return;
    }

    const productBarcode = await prisma.productBarcode.findUnique({
        where: {
            barcode: barcode
        },
        include: {
            product: {
                include: {
                    stockItems: true,
                    files: true,
                    tags: true,
                    barcodes: {
                        include: {
                            tags: true
                        }
                    }
                }
            }
        }
    });

    if (!productBarcode) {
        res.status(404).send({ error: 'Product not found' });
        return;
    }

    res.send(productBarcode.product);
}