import { NextFunction, Request, Response } from "express";
import prisma from '../lib/prisma';
import { UploadedFile } from "express-fileupload";
import { storeFile, UPLOAD_DIR } from "../lib/FileStorage";
import * as path from 'path';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const equipment = await prisma.equipment.findMany({
        include: {
            files: true
        },
        orderBy: {
            name: 'asc'
        }
    });
    res.send(equipment);
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const equipment = await prisma.equipment.findUnique({
        where: {
            id: parseInt(req.params.id)
        },
        include: {
            files: true
        }
    });
    if (!equipment) {
        res.sendStatus(404);
        return;
    }
    res.send(equipment);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { name, notes, purchaseDate } = req.body;

    // Parse purchaseDate if present
    let parsedDate = null;
    if (purchaseDate) {
        parsedDate = new Date(purchaseDate);
    }

    const equipment = await prisma.equipment.create({
        data: {
            name,
            notes,
            purchaseDate: parsedDate
        }
    });
    res.send(equipment);
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const id = parseInt(req.params.id);
    const { name, notes, purchaseDate, fileIds } = req.body;

    let updateData: any = {
        name,
        notes
    };

    if (purchaseDate !== undefined) {
        updateData.purchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    }

    // Handle file connections if fileIds array is provided
    if (Array.isArray(fileIds)) {
        updateData.files = {
            set: fileIds.map((fid: number) => ({ id: fid }))
        };
    }

    const equipment = await prisma.equipment.update({
        where: { id },
        data: updateData,
        include: {
            files: true
        }
    });
    res.send(equipment);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    await prisma.equipment.delete({
        where: {
            id: parseInt(req.params.id)
        }
    });
    res.send({});
}

// Helper to directly upload and attach a file to equipment
export const uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    if (!req.files || !req.files.file) {
        res.sendStatus(400);
        return;
    }

    const equipmentId = parseInt(req.params.id);
    const image = req.files.file as UploadedFile;

    const file = await prisma.file.create({
        data: {
            path: image.name,
            mimeType: image.mimetype,
            equipment: {
                connect: { id: equipmentId }
            }
        }
    });

    storeFile(image.tempFilePath, file.id.toString());

    res.send(file);
}
