import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const product = await prisma.product.findUnique({
        where: {
            id: parseInt(req.params.id)
        },
        include: {
            stockItems: { include: { location: true, reservations: true } },
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
            },
            prepRecipe: {
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
            stockItems: { include: { location: true, reservations: true } },
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
            },
            prepRecipe: {
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
            stockItems: { include: { location: true, reservations: true } },
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
            },
            prepRecipe: {
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
                    stockItems: { include: { location: true, reservations: true } },
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
                    },
                    prepRecipe: {
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

const OFF_USER_AGENT = "Pantry/1.0 (https://github.com/kevdog114/pantry)";
const OFF_FIELDS = "code,product_name,brands,quantity,image_url,categories";
const OFF_TIMEOUT_MS = 8000;

/**
 * Barcode variants worth trying against OpenFoodFacts. Hardware scanners
 * usually emit 12-digit UPC-A codes while OFF often stores the same product
 * under the 13-digit EAN (leading zero), and vice versa.
 */
const buildBarcodeCandidates = (raw: string): string[] => {
    const candidates: string[] = [];
    const add = (code: string) => {
        if (code && !candidates.includes(code)) candidates.push(code);
    };

    add(raw);

    if (/^\d+$/.test(raw)) {
        if (raw.length === 12) add("0" + raw);
        if (raw.length === 13 && raw.startsWith("0")) add(raw.substring(1));
        if (raw.length >= 6 && raw.length < 12) add(raw.padStart(13, "0"));
    }

    return candidates;
};

/**
 * Server-side OpenFoodFacts lookup. Kiosk devices often sit on restricted
 * networks without internet access, so the browser cannot query OFF directly;
 * the API server does it instead, with a proper User-Agent and timeout.
 * Response mirrors the OFF v2 shape ({ status, code, product }) so existing
 * consumers keep working.
 */
export const lookupBarcodeExternal = async (req: Request, res: Response): Promise<any> => {
    const barcode = ((req.query.barcode as string) || "").trim();
    if (!barcode) {
        return res.status(400).send({ error: 'Barcode is required' });
    }

    const candidates = buildBarcodeCandidates(barcode);
    let lastError: Error | null = null;

    for (const code of candidates) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
        try {
            const offRes = await fetch(
                `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
                {
                    headers: {
                        "User-Agent": OFF_USER_AGENT,
                        "Accept": "application/json"
                    },
                    signal: controller.signal
                }
            );

            if (offRes.status === 404) continue; // not under this code, try next variant

            if (!offRes.ok) {
                lastError = new Error(`OpenFoodFacts returned ${offRes.status}`);
                continue;
            }

            const data: any = await offRes.json();
            if (data && data.status === 1 && data.product) {
                return res.send({
                    status: 1,
                    code: code,
                    scannedBarcode: barcode,
                    product: data.product
                });
            }
        } catch (e) {
            lastError = e as Error;
            console.warn(`OpenFoodFacts lookup failed for ${code}:`, (e as Error).message);
        } finally {
            clearTimeout(timeout);
        }
    }

    // Distinguish "not in the database" from "couldn't reach OFF" so clients
    // can fall back to a direct browser lookup when only the server is offline.
    if (lastError) {
        return res.status(502).send({ status: 0, error: `OpenFoodFacts lookup failed: ${lastError.message}` });
    }

    res.send({ status: 0, code: barcode, product: null });
}