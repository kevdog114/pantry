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

    if (req.body.steps && req.body.steps.length > 0) {
        for (let i = 0; i < req.body.steps.length; i++) {
            await db.RecipeSteps.create({
                recipeId: recipe.id,
                stepNumber: i + 1,
                description: req.body.steps[i].description
            });
        }
    }

    res.send(recipe);
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await db.Recipes.findByPk(req.params.id);
    if(recipe === null) {
        res.sendStatus(404);
        return;
    }

    await recipe.destroy();
    res.sendStatus(200);
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await db.Recipes.findByPk(req.params.id, {
        include: [{
            model: db.RecipeSteps,
            as: 'steps'
        }],
        order: [
            [{ model: db.RecipeSteps, as: 'steps' }, 'stepNumber', 'ASC']
        ]
    });
    res.send(recipe);
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await db.Recipes.findByPk(req.params.id);
    if(recipe === null) {
        res.sendStatus(404);
        return;
    }

    await recipe.update({
        title: req.body.title,
        description: req.body.description,
        prepTime: req.body.prepTime,
        cookTime: req.body.cookTime,
        totalTime: req.body.totalTime,
        yield: req.body.yield
    });

    await db.RecipeSteps.destroy({
        where: {
            recipeId: recipe.id
        }
    });

    if (req.body.steps && req.body.steps.length > 0) {
        for (let i = 0; i < req.body.steps.length; i++) {
            await db.RecipeSteps.create({
                recipeId: recipe.id,
                stepNumber: i + 1,
                description: req.body.steps[i].description
            });
        }
    }

    res.send(recipe);
}
