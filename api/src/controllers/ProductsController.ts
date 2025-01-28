import { NextFunction, Response, Request } from "express";
import { db } from "../../models"
import { Op } from "sequelize";

const INCLUDES = ["Files", "StockItems", "ProductBarcodes"];

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var a = await db.Products.findByPk(req.params.id, { include: INCLUDES });
    console.log({
        fileCount: await (<any>a).countFiles()
    });
    res.send(a);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var p = await db.Products.create({
        title: req.body.title
    });

    var newBarcodes: any[] = req.body.ProductBarcodes;
    if(newBarcodes == undefined) newBarcodes = [];

    newBarcodes.forEach(async newBarcode => {
        // add it
        await db.ProductBarcodes.create({
            barcode: newBarcode.barcode,
            ProductId: (<any>p.dataValues).id
        })
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

    console.log("files", files);

    await (<any>p).removeFiles();
    await (<any>p).setFiles(files);

    res.send(p);
}

export const updateById = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Products.findByPk(req.params.id);
    if(entity == null)
    {
        res.sendStatus(404);
        return;
    }

    console.log("update", {
        body: req.body,
        title: req.body.title,
        id: req.params.id
    });

    entity = await entity.update({
        title: req.body.title
    });

    console.log("update 2", entity);

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

    await (<any>entity).removeFiles();
    await (<any>entity).setFiles(files);

    res.send(await db.Products.findByPk(req.params.id, { include: INCLUDES }));
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send(await db.Products.findAll({ include: INCLUDES }));
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