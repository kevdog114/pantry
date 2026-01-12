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
                    },
                    prepTasks: true
                }
            }
        }
    });
    res.send(meals.map(mapMealPlan));
}

export const addMealToPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { date, recipeId } = req.body;
    console.log(`[Method: addMealToPlan] Request Body:`, req.body); // Debug log

    if (!date || !recipeId) {
        console.error("Missing date or recipeId");
        return res.status(400).send("Date and RecipeId are required");
    }

    try {
        const meal = await prisma.mealPlan.create({
            data: {
                date: new Date(date),
                recipeId: Number(recipeId) // Safer than parseInt for general numeric casting
            },
            include: {
                recipe: true
            }
        });
        res.send(mapMealPlan(meal));
    } catch (e) {
        console.error("Error creating meal plan:", e);
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

export const saveLogisticsTasks = async (req: Request, res: Response): Promise<any> => {
    const { tasks } = req.body as { tasks: any[] }; // Expecting array of LogisticsTask-like objects

    if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).send("Tasks array required");
    }

    console.log(`[saveLogisticsTasks] Received ${tasks.length} tasks to save.`);

    if (tasks.length === 0) return res.send({ message: "No tasks to save" });

    // Validate dates
    const validTasks = tasks.filter((t: any) => {
        const d = new Date(t.date);
        return !isNaN(d.getTime());
    });

    if (validTasks.length !== tasks.length) {
        console.warn(`[saveLogisticsTasks] Filtered out ${tasks.length - validTasks.length} tasks with invalid dates.`);
    }

    if (validTasks.length === 0) {
        return res.status(400).send("No valid tasks to save (check date format)");
    }

    const dates = validTasks.map((t: any) => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Set maxDate to end of day
    maxDate.setHours(23, 59, 59, 999);
    minDate.setHours(0, 0, 0, 0);

    console.log(`[saveLogisticsTasks] Date range: ${minDate.toISOString()} - ${maxDate.toISOString()}`);

    try {
        // 2. Delete existing tasks in this range to avoid duplicates (re-planning)
        const deleteResult = await prisma.mealTask.deleteMany({
            where: {
                date: {
                    gte: minDate,
                    lte: maxDate
                },
                completed: false
            }
        });
        console.log(`[saveLogisticsTasks] Deleted ${deleteResult.count} existing non-completed tasks.`);

        // 3. Insert new tasks
        const createdTasks = [];
        for (const [index, t] of validTasks.entries()) {
            try {
                const taskDate = new Date(t.date);
                const mealPlanId = t.relatedMealPlanId ? parseInt(String(t.relatedMealPlanId)) : null;
                const recipeId = t.relatedRecipeId ? parseInt(String(t.relatedRecipeId)) : null;

                const newTask = await prisma.mealTask.create({
                    data: {
                        date: taskDate,
                        type: String(t.type || 'Generic'),
                        description: String(t.description || ''),
                        mealPlanId: mealPlanId,
                        recipeId: recipeId,
                        completed: false
                    }
                });
                createdTasks.push(newTask);
            } catch (innerError: any) {
                console.error(`[saveLogisticsTasks] Error saving task at index ${index}:`, JSON.stringify(t), innerError.message);
                // We construct a helpful error message to return
                throw new Error(`Failed to save task: ${t.description}. ${innerError.message}`);
            }
        }

        console.log(`[saveLogisticsTasks] Successfully saved ${createdTasks.length} tasks.`);
        res.json({ message: "Tasks saved", count: createdTasks.length });
    } catch (e: any) {
        console.error("Error saving tasks:", e);
        // Respond with 500 but meaningful message
        res.status(500).json({ error: e.message || "Unknown error saving tasks" });
    }
};

export const getUpcomingTasks = async (req: Request, res: Response): Promise<any> => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tasks = await prisma.mealTask.findMany({
            where: {
                date: {
                    gte: today
                },
                completed: false
            },
            orderBy: {
                date: 'asc'
            },
            take: 10,
            include: {
                recipe: {
                    select: { name: true }
                }
            }
        });

        res.json(tasks.map(t => ({
            ...t,
            recipeTitle: t.recipe?.name
        })));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const completeTask = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const { completed } = req.body;

    try {
        const task = await prisma.mealTask.update({
            where: { id: parseInt(id) },
            data: { completed: completed }
        });
        res.json(task);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
