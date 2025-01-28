import { NextFunction, Request, Response } from "express";
import { UploadedFile } from "express-fileupload";
import { db } from "../../models"
import * as fs from "fs";

const uploadDir = __dirname + "/../../../data/upload/";

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Files.findByPk(req.params.id);
    if(entity != null) {
        fs.unlinkSync(uploadDir + entity.dataValues.id);
    }
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Files.findByPk(req.params.id);
    if(entity != null) {
        res.download(uploadDir + entity.dataValues.id, entity.dataValues.filename);
    }
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
        const image: UploadedFile = <any>req.files!.file;

        // If no image submitted, exit
        if (!image) return res.sendStatus(400);

        // create a new record in the database
        var entity = await db.Files.create({
            filename: image.name
        });

        // Move the uploaded image to our upload folder
        image.mv(uploadDir + entity.dataValues.id);
    
        res.send(entity);
}