import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';
import { generateReceiptSteps } from '../services/RecipeAIService';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipes = await prisma.recipe.findMany({
        include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            ingredients: { include: { product: true } },
            files: true,
            quickActions: true
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
            },
            ingredients: {
                create: req.body.ingredients?.map((ing: any) => ({
                    name: ing.name,
                    amount: ing.amount,
                    unit: ing.unit,
                    productId: ing.productId || null
                })) || []
            },
            prepTasks: {
                create: req.body.prepTasks?.map((task: any) => ({
                    description: task.description,
                    daysInAdvance: task.daysInAdvance || 0
                })) || []
            },
            files: {
                connect: req.body.files?.map((f: any) => ({ id: f.id })) || []
            },
            quickActions: {
                create: req.body.quickActions?.map((qa: any) => ({
                    name: qa.name,
                    type: qa.type,
                    value: qa.value
                })) || []
            }
        },
        include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            ingredients: { include: { product: true } },
            prepTasks: true,
            files: true,
            quickActions: true
        }
    });

    // Generate Receipt Steps
    try {
        const receiptSteps = await generateReceiptSteps(recipe.name, recipe.ingredients, recipe.steps);
        if (receiptSteps) {
            // Update the recipe with the generated steps
            await prisma.recipe.update({
                where: { id: recipe.id },
                data: { receiptSteps }
            });
            // Attach to response object manually since we aren't re-fetching
            (recipe as any).receiptSteps = receiptSteps;
        }
    } catch (genError) {
        console.error("Failed to generate receipt steps on create", genError);
    }

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
            steps: { orderBy: { stepNumber: 'asc' } },
            ingredients: { include: { product: true } },
            prepTasks: true,
            files: true,
            quickActions: true
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
        let recipe = await prisma.recipe.update({
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
                },
                ingredients: {
                    deleteMany: {},
                    create: req.body.ingredients?.map((ing: any) => ({
                        name: ing.name,
                        amount: ing.amount,
                        unit: ing.unit,
                        productId: ing.productId || null
                    })) || []
                },
                prepTasks: {
                    deleteMany: {},
                    create: req.body.prepTasks?.map((task: any) => ({
                        description: task.description,
                        daysInAdvance: task.daysInAdvance || 0
                    })) || []
                },
                customPrepInstructions: req.body.customPrepInstructions, // Keeping for backward compat if needed
                thawInstructions: req.body.thawInstructions,
                files: {
                    set: req.body.files?.map((f: any) => ({ id: f.id })) || []
                },
                quickActions: {
                    deleteMany: {},
                    create: req.body.quickActions?.map((qa: any) => ({
                        name: qa.name,
                        type: qa.type,
                        value: qa.value
                    })) || []
                }
            },
            include: {
                steps: { orderBy: { stepNumber: 'asc' } },
                ingredients: { include: { product: true } },
                prepTasks: true,
                files: true,
                quickActions: true
            }
        });

        // Generate Receipt Steps (Async but we wait to ensure it's saved)
        try {
            const receiptSteps = await generateReceiptSteps(recipe.name, recipe.ingredients, recipe.steps);
            if (receiptSteps) {
                recipe = await prisma.recipe.update({
                    where: { id: recipe.id },
                    data: { receiptSteps },
                    include: {
                        steps: { orderBy: { stepNumber: 'asc' } },
                        ingredients: { include: { product: true } },
                        prepTasks: true,
                        files: true,
                        quickActions: true
                    }
                });
            }
        } catch (genError) {
            console.error("Failed to generate receipt steps on update", genError);
        }

        res.send(mapToResponse(recipe));
    } catch (error) {
        console.error(error);
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
        })) || [],
        ingredients: recipe.ingredients?.map((ing: any) => ({
            id: ing.id,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            productId: ing.productId,
            product: ing.product // Pass full product if needed (title, etc)
        })) || [],
        prepTasks: recipe.prepTasks || [],
        thawInstructions: recipe.thawInstructions,
        customPrepInstructions: recipe.customPrepInstructions,
        files: recipe.files || [],
        receiptSteps: recipe.receiptSteps,
        quickActions: recipe.quickActions || []
    };
}
