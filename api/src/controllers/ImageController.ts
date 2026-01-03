import { NextFunction, Request, Response } from "express";
import { UploadedFile } from "express-fileupload";
import prisma from '../lib/prisma';
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
    const file = await prisma.file.findUnique({
        where: {
            id: parseInt(req.params.id)
        }
    });

    if(file) {
        await prisma.file.delete({
            where: {
                id: file.id
            }
        });
        fs.unlinkSync(uploadDir + file.id);
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const file = await prisma.file.findUnique({
        where: {
            id: parseInt(req.params.id)
        }
    });

    if(file) {
        if(req.query.size !== undefined) {
            const path = await ensureThumbnailExistsAndGetPath(file.id, req.query.size as ThumbnailSizes);
            res.download(path, file.path);
        } else {
            res.download(uploadDir + file.id, file.path);
        }
    } else {
        res.sendStatus(404);
    }
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    if (!req.files || !req.files.file) {
        res.sendStatus(400);
        return;
    }

    const image = req.files.file as UploadedFile;
    const file = await prisma.file.create({
        data: {
            path: image.name,
            mimeType: image.mimetype
        }
    });

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.copyFileSync(image.tempFilePath, uploadDir + file.id);
    fs.unlinkSync(image.tempFilePath);

    res.send(file);
}
