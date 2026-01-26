import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';
import { generateReceiptSteps, determineSafeCookingTemps } from '../services/RecipeAIService';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const recipes = await prisma.recipe.findMany({
        include: {
            steps: { orderBy: { stepNumber: 'asc' } },
            ingredients: { include: { product: true } },
            files: true,
            quickActions: true,
            safeTemps: true
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
            quickActions: true,
            safeTemps: true
        }
    });

    // Generate Receipt Steps & Safe Temps
    try {
        const [receiptSteps, safeTemps] = await Promise.all([
            generateReceiptSteps(recipe.name, recipe.ingredients, recipe.steps),
            determineSafeCookingTemps(recipe.ingredients)
        ]);

        const updates: any = {};

        if (receiptSteps) {
            updates.receiptSteps = receiptSteps;
            (recipe as any).receiptSteps = receiptSteps;
        }

        if (safeTemps && safeTemps.length > 0) {
            updates.safeTemps = {
                create: safeTemps.map(st => ({
                    item: st.item,
                    temperature: st.temperature
                }))
            };
        }

        if (Object.keys(updates).length > 0) {
            await prisma.recipe.update({
                where: { id: recipe.id },
                data: updates
            });

            // Reload if we added relations (optional, but good for response)
            if (updates.safeTemps) {
                const updated = await prisma.recipe.findUnique({
                    where: { id: recipe.id },
                    include: { safeTemps: true }
                });
                if (updated) (recipe as any).safeTemps = updated.safeTemps;
            }
        }

    } catch (genError) {
        console.error("Failed to generate AI content on create", genError);
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
            quickActions: true,
            safeTemps: true
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
                },
                safeTemps: {
                    deleteMany: {} // We will regenerate them potentially, or leave them? 
                    // The user said "use gemini to determine... save this with the recipe"
                    // If ingredients change, safe temps might change. Safer to regenerate or allowed to be manual?
                    // For now, let's clear and regenerate if ingredients changed. 
                    // Actually, simpler to just always regenerate for now since this is an "update" op.
                    // But maybe only if ingredients changed? 
                    // The user didn't specify, but regeneration is safer to keep in sync.
                }
            },
            include: {
                steps: { orderBy: { stepNumber: 'asc' } },
                ingredients: { include: { product: true } },
                prepTasks: true,
                files: true,
                quickActions: true,
                safeTemps: true
            }
        });

        // Generate AI Content
        try {
            const [receiptSteps, safeTemps] = await Promise.all([
                generateReceiptSteps(recipe.name, recipe.ingredients, recipe.steps),
                determineSafeCookingTemps(recipe.ingredients)
            ]);

            const updates: any = {};

            if (receiptSteps) {
                updates.receiptSteps = receiptSteps;
            }

            if (safeTemps && safeTemps.length > 0) {
                updates.safeTemps = {
                    create: safeTemps.map(st => ({
                        item: st.item,
                        temperature: st.temperature
                    }))
                };
            }

            if (Object.keys(updates).length > 0) {
                recipe = await prisma.recipe.update({
                    where: { id: recipe.id },
                    data: updates,
                    include: {
                        steps: { orderBy: { stepNumber: 'asc' } },
                        ingredients: { include: { product: true } },
                        prepTasks: true,
                        files: true,
                        quickActions: true,
                        safeTemps: true
                    }
                });
            }
        } catch (genError) {
            console.error("Failed to generate AI content on update", genError);
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
