import { NextFunction, Response, Request } from "express";
import { db } from "../../models"
import { Op } from "sequelize";
import { Product, ProductDataObject } from "../../models/product";


export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    
    var a = (await db.Products.findByPk(req.params.id, { include: [
        db.StockItems,
        db.Files,
        { model: db.ProductBarcodes, include: [db.Tags]},
        db.Tags
    ] })) as Product | null;

    res.send(a);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {

    var p = await db.Products.create({
        title: req.body.title,
        freezerLifespanDays: req.body.freezerLifespanDays,
        openedLifespanDays: req.body.openedLifespanDays,
        refrigeratorLifespanDays: req.body.refrigeratorLifespanDays
    });
    
    var newBarcodes: any[] = req.body.ProductBarcodes;
    if(newBarcodes == undefined) newBarcodes = [];

    newBarcodes.forEach(async newBarcode => {
        // add it
        var newEntity = await db.ProductBarcodes.create({
            barcode: newBarcode.barcode,
            ProductId: p.dataValues.id!,
            brand: newBarcode.brand,
            description: newBarcode.description,
            quantity: newBarcode.quantity
        });

        if(newBarcode.Tags) {
            let tagIds = newBarcode.Tags.map((a: any) => a.id);
            let tags = await db.Tags.findAll({
                where: {
                    id: {
                        [Op.in]: tagIds
                    }
                }
            });
            await (newEntity as any).setTags(tags);
        }
    });


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

    await p.removeFiles();
    await p.setFiles(files);

    res.send(p);
}

export const updateById = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Products.findByPk(req.params.id);
    if(entity == null)
    {
        res.sendStatus(404);
        return;
    }

    entity = await entity.update({
        title: req.body.title,
        freezerLifespanDays: req.body.freezerLifespanDays,
        openedLifespanDays: req.body.openedLifespanDays,
        refrigeratorLifespanDays: req.body.refrigeratorLifespanDays
    });

    // update the barcodes
    var existingBarcodes: Array<any> = await entity.getProductBarcodes();
    var newBarcodes: Array<any> = req.body.ProductBarcodes;
    if(existingBarcodes == null) existingBarcodes = [];
    if(newBarcodes == null) newBarcodes = [];

    for(let i = 0; i < existingBarcodes.length; i++) {
        let existingBarcode = existingBarcodes[i];
        var matchingBarcode = newBarcodes.find(a => a.barcode == existingBarcode.barcode);
        if(matchingBarcode == undefined)
        {
            // delete it
            await existingBarcode.destroy();
        }
    }

    for(let i = 0; i < newBarcodes.length; i++) {
        let newBarcode = newBarcodes[i];
        var matchingBarcode = existingBarcodes.find(a => a.barcode == newBarcode.barcode);
        if(matchingBarcode == undefined)
        {
            // add it
            let newEntity = await db.ProductBarcodes.create({
                barcode: newBarcode.barcode,
                ProductId: req.params.id,
                brand: newBarcode.brand,
                description: newBarcode.description,
                quantity: newBarcode.quantity
            });

            if(newBarcode.Tags) {
                let tagIds = newBarcode.Tags.map((a: any) => a.id);
                let tags = await db.Tags.findAll({
                    where: {
                        id: {
                            [Op.in]: tagIds
                        }
                    }
                });
                await (newEntity as any).setTags(tags);
            }
        } else {
            // update it
            if(newBarcode.Tags) {
                let tagIds = newBarcode.Tags.map((a: any) => a.id);
                let tags = await db.Tags.findAll({
                    where: {
                        id: {
                            [Op.in]: tagIds
                        }
                    }
                });
                await (matchingBarcode as any).setTags(tags);
            }
        }
    }

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

    res.send(await db.Products.findByPk(req.params.id, { include: [
        db.StockItems,
        db.Files,
        db.ProductBarcodes,
        db.Tags
    ] }));
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    type productEntityWithSummary = ProductDataObject & {
        minExpiration: Date,
        quantityExpiringSoon: number,
        totalQuantity: number,
        StockItems: any[]
    }
    var products = (await db.Products
        .findAll({
            include: [
                db.StockItems,
                db.Files,
                db.ProductBarcodes,
                db.Tags
            ]
        })).map(p => p.get({ plain: true })) as unknown as productEntityWithSummary[];
    
    products.forEach(product => {
        let stockItems = product.StockItems;
        let minExp: Date | undefined = undefined;
        let quantityExpiringSoon: number | undefined = undefined;
        let totalQuantity: number | undefined = undefined;

        if(stockItems && stockItems.length > 0)
        {
            minExp = stockItems[0].expiration;
            quantityExpiringSoon = stockItems[0].quantity;
            totalQuantity = 0;

            stockItems.forEach((stockItem: any) => {
                totalQuantity! += stockItem.quantity;
                if(stockItem.expiration < minExp!)
                {
                    minExp = stockItem.expiration;
                    quantityExpiringSoon = stockItem.quantity;
                }
            });

            if(minExp)
              product.minExpiration = minExp;
            if(quantityExpiringSoon)
              product.quantityExpiringSoon = quantityExpiringSoon;
            if(totalQuantity)
              product.totalQuantity = totalQuantity;
        }
    });

    //products = products.filter(a => a.StockItems && a.StockItems.length > 0);

    products.sort((a, b) => {
        
        if(a.minExpiration === b.minExpiration)
            return 0;
        else if(a.minExpiration === undefined)
            return 1;
        else if(b.minExpiration === undefined)
            return -1;
        else return a.minExpiration < b.minExpiration
            ? -1 : 1;
    });

    console.log("Products sorted", products.map(a => {
        return {
            id: a.id,
            exp: a.minExpiration
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
            barcode: req.query.barcode as string
        }
    });
    
    if(product !== null)
        res.send(product);
    else
        res.sendStatus(404);
}