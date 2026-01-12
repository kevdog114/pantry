import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

const mapMealPlan = (meal: any) => {
    if (meal.recipe) {
        meal.recipe.title = meal.recipe.name;
    }
    return meal;
};

export const getMealPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).send("StartDate and EndDate are required");
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    const meals = await prisma.mealPlan.findMany({
        where: {
            date: {
                gte: start,
                lte: end
            }
        },
        include: {
            recipe: {
                include: {
                    ingredients: {
                        include: {
                            product: {
                                include: {
                                    stockItems: true
                                }
                            },
                            unitOfMeasure: true
                        }
                    }
                }
            }
        }
    });
    res.send(meals.map(mapMealPlan));
}

export const addMealToPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { date, recipeId } = req.body;
    try {
        const meal = await prisma.mealPlan.create({
            data: {
                date: new Date(date),
                recipeId: parseInt(recipeId)
            },
            include: {
                recipe: true
            }
        });
        res.send(mapMealPlan(meal));
    } catch (e) {
        console.error(e);
        res.status(500).send("Error adding meal to plan");
    }
}

export const updateMealPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { id } = req.params;
    const { date } = req.body;
    try {
        const meal = await prisma.mealPlan.update({
            where: { id: parseInt(id) },
            data: {
                date: new Date(date)
            },
            include: {
                recipe: true
            }
        });
        res.send(mapMealPlan(meal));
    } catch (e) {
        console.error(e);
        res.status(500).send("Error updating meal plan");
    }
}

export const removeMealFromPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { id } = req.params;
    try {
        await prisma.mealPlan.delete({
            where: { id: parseInt(id) }
        });
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.sendStatus(404);
    }
}
