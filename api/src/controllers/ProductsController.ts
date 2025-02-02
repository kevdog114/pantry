import { NextFunction, Response, Request } from "express";
import { db } from "../../models"
import { Op } from "sequelize";


const INCLUDES = ["Files", "StockItems", "ProductBarcodes", "Tags"];

interface ProductStockItemEntity {
    dataValues: {
        expiration: Date
        quantity: number
        ProductId: number
    }
}

interface ProductTags {
    dataValues: {
        tagname: string
        taggroup: string
    }
}

interface ProductFileEntity {
    dataValues: {
        id: number,
        filename: string
    }
}

interface ProductEntityDataValues {
    id: number,
    title: string,
    Files: Array<any>,
    StockItems: Array<any>,
    ProductBarcodes: Array<any>
}

interface ProductEntity {
    dataValues: ProductEntityDataValues
    StockItems: Array<ProductStockItemEntity>

    setFiles(files: ProductFileEntity[]): Promise<any>
    removeFiles(): Promise<any>
    countFiles(): Promise<number>
    getProductBarcodes(): Promise<any>
    getStockItems(): Promise<ProductStockItemEntity[]>
    getTags(): Promise<ProductTags[]>
    setTags(tags: ProductTags[]): Promise<any>
    removeTags(): Promise<any>

    update(updates: Partial<ProductEntityDataValues>): Promise<any>
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    
    var a = (await db.Products.findByPk(req.params.id, { include: INCLUDES })) as ProductEntity | null;

    res.send(a);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var aa: ProductEntity;
    
    var p = (await db.Products.create({
        title: req.body.title
    })) as unknown as ProductEntity;
    
    var newBarcodes: any[] = req.body.ProductBarcodes;
    if(newBarcodes == undefined) newBarcodes = [];

    newBarcodes.forEach(async newBarcode => {
        // add it
        await db.ProductBarcodes.create({
            barcode: newBarcode.barcode,
            ProductId: p.dataValues.id
        })
    });


    let associatedFiles = [];
    if(req.body.fileIds)
        associatedFiles = req.body.fileIds;

    let files = (await db.Files.findAll({
        where: {
            id: {
                [Op.in]: associatedFiles
            }
        }
    })) as ProductFileEntity[];

    await p.removeFiles();
    await p.setFiles(files);

    res.send(p);
}

export const updateById = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Products.findByPk(req.params.id) as unknown as ProductEntity;
    if(entity == null)
    {
        res.sendStatus(404);
        return;
    }

    entity = await entity.update({
        title: req.body.title
    });

    // update the barcodes
    var existingBarcodes: Array<any> = await (<any>entity).getProductBarcodes();
    var newBarcodes: Array<any> = req.body.ProductBarcodes;
    if(existingBarcodes == null) existingBarcodes = [];
    if(newBarcodes == null) newBarcodes = [];
    existingBarcodes.forEach(async existingBarcode => {
        var matchingBarcode = newBarcodes.find(a => a.barcode == existingBarcode.barcode);
        if(matchingBarcode == undefined)
        {
            // delete it
            await existingBarcode.destroy();
        }
    });
    newBarcodes.forEach(async newBarcode => {
        var matchingBarcode = existingBarcodes.find(a => a.barcode == newBarcode.barcode);
        if(matchingBarcode == undefined)
        {
            // add it
            await db.ProductBarcodes.create({
                barcode: newBarcode.barcode,
                ProductId: req.params.id
            })
        }
    })

    let associatedFiles = [];
    if(req.body.fileIds)
        associatedFiles = req.body.fileIds;

    let files = await db.Files.findAll({
        where: {
            id: {
                [Op.in]: associatedFiles
            }
        }
    });

    await entity.removeFiles();
    await entity.setFiles(files);


    let associatedTags = [];
    if(req.body.tagIds)
        associatedTags = req.body.tagIds;

    let tags = await db.Tags.findAll({
        where: {
            id: {
                [Op.in]: associatedTags
            }
        }
    })

    await entity.removeTags();
    await entity.setTags(tags);

    res.send(await db.Products.findByPk(req.params.id, { include: INCLUDES }));
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    type productEntityWithSummary = ProductEntity & {
        dataValues: {
            minExpiration: Date,
            quantityExpiringSoon: number,
            totalQuantity: number
        }
    }
    var products = (await db.Products
        .findAll({
            include: INCLUDES
        })) as unknown as productEntityWithSummary[];
    
    products.forEach(product => {
        let stockItems = product.StockItems;
        let minExp: Date | undefined = undefined;
        let quantityExpiringSoon: number | undefined = undefined;
        let totalQuantity: number | undefined = undefined;

        if(stockItems && stockItems.length > 0)
        {
            minExp = stockItems[0].dataValues.expiration;
            quantityExpiringSoon = stockItems[0].dataValues.quantity;
            totalQuantity = 0;

            stockItems.forEach(stockItem => {
                totalQuantity! += stockItem.dataValues.quantity;
                if(stockItem.dataValues.expiration < minExp!)
                {
                    minExp = stockItem.dataValues.expiration;
                    quantityExpiringSoon = stockItem.dataValues.quantity;
                }
            });

            product.dataValues.minExpiration = minExp;
            product.dataValues.quantityExpiringSoon = quantityExpiringSoon;
            product.dataValues.totalQuantity = totalQuantity;
        }
    });

    //products = products.filter(a => a.StockItems && a.StockItems.length > 0);

    products.sort((a, b) => {
        
        if(a.dataValues.minExpiration === b.dataValues.minExpiration)
            return 0;
        else if(a.dataValues.minExpiration === undefined)
            return 1;
        else if(b.dataValues.minExpiration === undefined)
            return -1;
        else return a.dataValues.minExpiration < b.dataValues.minExpiration
            ? -1 : 1;
    });

    console.log("Products sorted", products.map(a => {
        return {
            id: a.dataValues.id,
            exp: a.dataValues.minExpiration
        }
    }));
        
    res.send(products);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Products.findByPk(req.params.id);
    if(entity != null) {
        await entity?.destroy();
        res.send({});
    }
}

export const searchProductByBarcode = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var product = await db.ProductBarcodes.findOne({
        where: {
            barcode: req.query.barcode
        }
    });
    

    if(product !== null)
        res.send(product);
    else
        res.sendStatus(404);
}