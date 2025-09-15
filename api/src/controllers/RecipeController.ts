import { NextFunction, Response, Request } from "express";
import { db } from "../../models"

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipes = await db.Recipes.findAll();
    res.send(recipes);
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await db.Recipes.create({
        title: req.body.title,
        description: req.body.description,
        prepTime: req.body.prepTime,
        cookTime: req.body.cookTime,
        totalTime: req.body.totalTime,
        yield: req.body.yield
    });
    res.send(recipe);
}
