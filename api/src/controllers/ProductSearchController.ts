import { NextFunction, Response, Request } from "express";
import { db } from "../../models"
import { QueryTypes } from "sequelize";
import { ProductDataObject } from "../../models/product";

export const search = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var query = req.query.q as string;
    
    query = query.replaceAll(/\s+/g, " OR ");
    query = query.replaceAll("OR AND OR", "AND");

    var results = await db.sequelize.query<ProductDataObject>("SELECT * FROM product_fts, Products WHERE product_fts MATCH ? AND product_fts.rowid = Products.id", {
        replacements: [ query ],
        type: QueryTypes.SELECT
    });

    res.send(results);
}

export const getall = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var results = await db.sequelize.query("INSERT INTO product_fts (rowid, title) VALUES (4, 'kevin')", {
        type: QueryTypes.INSERT
    });

    res.send({'status': 'ok'});
}