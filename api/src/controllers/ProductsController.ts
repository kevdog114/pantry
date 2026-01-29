import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const product = await prisma.product.findUnique({
        where: {
            id: parseInt(req.params.id)
        },
        include: {
            stockItems: { include: { location: true } },
            files: true,
            barcodes: {
                include: {
                    tags: true
                }
            },
            tags: true,
            cookingInstructions: {
                include: {
                    steps: { orderBy: { stepNumber: 'asc' } }
                }
            }
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
            pantryLifespanDays: req.body.pantryLifespanDays,
            trackCountBy: req.body.trackCountBy,
            autoPrintLabel: req.body.autoPrintLabel,
            barcodes: {
                create: (req.body.barcodes || []).map((barcode: any) => ({
                    barcode: barcode.barcode,
                    brand: barcode.brand,
                    description: barcode.description,
                    tareWeight: barcode.tareWeight,
                    ...(barcode.tags && barcode.tags.length > 0 && {
                        tags: {
                            connect: barcode.tags.filter((t: any) => t.id > 0).map((t: any) => ({ id: t.id }))
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
    // Manual cascade delete dependencies
    await prisma.stockItem.deleteMany({ where: { productId: parseInt(req.params.id) } });
    await prisma.productBarcode.deleteMany({ where: { productId: parseInt(req.params.id) } });
    await prisma.recipeProduct.deleteMany({ where: { productId: parseInt(req.params.id) } });
    await prisma.shoppingListItem.deleteMany({ where: { productId: parseInt(req.params.id) } });

    // Handle Leftovers relation (SetNull or Delete? Depending on logic. Safe to just update leftovers)
    // Actually schema says: leftoverRecipe Recipe? @relation("RecipeLeftovers"...)
    // But Recipe has leftovers Product[] @relation("RecipeLeftovers")
    // If we delete the product, we dont need to update Recipe explicitly if not required, but strict mode might.
    // However, FK error is likely from one of the above.


    await prisma.product.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send({ success: true });
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const products = await prisma.product.findMany({
        where: req.query.locationId ? {
            stockItems: {
                some: {
                    locationId: parseInt(req.query.locationId as string)
                }
            }
        } : undefined,
        include: {
            stockItems: { include: { location: true } },
            files: true,
            barcodes: {
                include: {
                    tags: true
                }
            },
            tags: true,
            cookingInstructions: {
                include: {
                    steps: { orderBy: { stepNumber: 'asc' } }
                }
            }
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
            pantryLifespanDays: req.body.pantryLifespanDays,
            trackCountBy: req.body.trackCountBy,
            autoPrintLabel: req.body.autoPrintLabel,
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
                    create: (req.body.barcodes || []).map((barcode: any) => ({
                        barcode: barcode.barcode,
                        brand: barcode.brand,
                        description: barcode.description,
                        tareWeight: barcode.tareWeight,
                        ...(barcode.tags && barcode.tags.length > 0 && {
                            tags: {
                                connect: barcode.tags.filter((t: any) => t.id > 0).map((t: any) => ({ id: t.id }))
                            }
                        })
                    }))
                },
            })
        },
        include: {
            stockItems: { include: { location: true } },
            files: true,
            barcodes: {
                include: {
                    tags: true
                }
            },
            tags: true,
            cookingInstructions: {
                include: {
                    steps: { orderBy: { stepNumber: 'asc' } }
                }
            }
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
                    stockItems: { include: { location: true } },
                    files: true,
                    tags: true,
                    barcodes: {
                        include: {
                            tags: true
                        }
                    },
                    cookingInstructions: {
                        include: {
                            steps: { orderBy: { stepNumber: 'asc' } }
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