import { NextFunction, Response, Request } from "express";
import { db } from "../../models"

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var a = await db.Tags.findByPk(req.params.id);
    res.send(a);
}

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var a = await db.Tags.findAll();
    res.send(a);
}
export const getAllForGroup = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    var a = await db.Tags.findAll({
        where: {
            taggroup: req.params.group
        }
    });

    res.send(a);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    
    var p = await db.Tags.create({
        tagname: req.body.tagname,
        taggroup: req.body.taggroup
    });

    res.send(p);
}

export const updateById = async(req: Request, res: Response, next: NextFunction): Promise<any> => {
    var entity = await db.Tags.findByPk(req.params.id);
    if(entity == null)
    {
        res.sendStatus(404);
        return;
    }

    entity = await entity.update({
        tagname: req.body.tagname
    });

    res.send(entity);
}

export const getGroups = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    res.send([
        { code: "location", display: "Location" },
        { code: "category", display: "Category" }
    ]);
}
