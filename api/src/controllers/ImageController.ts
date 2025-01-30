import { NextFunction, Request, Response } from "express";
import { UploadedFile } from "express-fileupload";
import { db } from "../../models"
import * as fs from "fs";
import sharp from "sharp";

const uploadDir = __dirname + "/../../../data/upload/";

export type ThumbnailSizes = "small";

export const GetDimensionForThumbnailSize = (size: ThumbnailSizes): number => {
    if(size === "small")
        return 150;
    else
        return 200;
}

export const ensureThumbnailExistsAndGetPath = async (imgId: number, thumbnailSize: ThumbnailSizes): Promise<string> => {
    let maxSize = GetDimensionForThumbnailSize(thumbnailSize);

    const imgPath = uploadDir + imgId;
    const thumbPath = imgPath + "_thumb_" + maxSize;
    if(fs.existsSync(thumbPath) === false)
    {
        console.log("Generating thumbnail for " + imgId);
        await sharp(imgPath)
          .resize(maxSize, maxSize, { fit: "contain" })
          .jpeg()
          .withMetadata()
          .toFile(thumbPath);
    }

    return thumbPath;
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Files.findByPk(req.params.id);
    if(entity != null) {
        fs.unlinkSync(uploadDir + entity.dataValues.id);
    }
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Files.findByPk(req.params.id);
    if(entity != null) {
        if(req.query.size !== undefined)
            res.download(await ensureThumbnailExistsAndGetPath(entity.dataValues.id, req.query.size as ThumbnailSizes), entity.dataValues.filename);
        else
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