import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipes = await prisma.recipe.findMany({
        include: {
            steps: {
                orderBy: {
                    stepNumber: 'asc'
                }
            }
        }
    });
    res.send(recipes.map(mapToResponse));
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await prisma.recipe.create({
        data: {
            name: req.body.title,
            description: req.body.description,
            source: req.body.source || 'user',
            ingredientText: req.body.ingredientText,
            prepTime: req.body.prepTime,
            cookTime: req.body.cookTime,
            totalTime: req.body.totalTime,
            yield: req.body.yield,
            steps: {
                create: req.body.steps?.map((step: any, index: number) => ({
                    stepNumber: index + 1,
                    instruction: step.description
                })) || []
            }
        },
        include: {
            steps: {
                orderBy: {
                    stepNumber: 'asc'
                }
            }
        }
    });

    res.send(mapToResponse(recipe));
}

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        await prisma.recipe.delete({
            where: {
                id: parseInt(req.params.id)
            }
        });
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(404);
    }
}

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipe = await prisma.recipe.findUnique({
        where: {
            id: parseInt(req.params.id)
        },
        include: {
            steps: {
                orderBy: {
                    stepNumber: 'asc'
                }
            }
        }
    });

    if (!recipe) {
        res.sendStatus(404);
        return;
    }

    res.send(mapToResponse(recipe));
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const recipe = await prisma.recipe.update({
            where: {
                id: parseInt(req.params.id)
            },
            data: {
                name: req.body.title,
                description: req.body.description,
                source: req.body.source,
                ingredientText: req.body.ingredientText,
                prepTime: req.body.prepTime,
                cookTime: req.body.cookTime,
                totalTime: req.body.totalTime,
                yield: req.body.yield,
                steps: {
                    deleteMany: {},
                    create: req.body.steps?.map((step: any, index: number) => ({
                        stepNumber: index + 1,
                        instruction: step.description
                    })) || []
                }
            },
            include: {
                steps: {
                    orderBy: {
                        stepNumber: 'asc'
                    }
                }
            }
        });

        res.send(mapToResponse(recipe));
    } catch (error) {
        res.sendStatus(404);
    }
}

const mapToResponse = (recipe: any) => {
    return {
        ...recipe,
        title: recipe.name,
        steps: recipe.steps?.map((step: any) => ({
            ...step,
            description: step.instruction
        })) || []
    };
}
