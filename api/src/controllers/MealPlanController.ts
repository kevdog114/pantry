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
    const { tasks, startDate, endDate } = req.body as { tasks: any[], startDate?: string, endDate?: string };

    if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).send("Tasks array required");
    }

    // Determine deletion range
    let minDate: Date;
    let maxDate: Date;

    if (startDate && endDate) {
        minDate = new Date(startDate);
        maxDate = new Date(endDate);
    } else {
        // Fallback to inferring from tasks (legacy behavior, risky for edge cases)
        if (tasks.length === 0) return res.send({ message: "No tasks to save and no range provided" });

        const dates = tasks
            .map((t: any) => new Date(t.date))
            .filter(d => !isNaN(d.getTime()));

        if (dates.length === 0) return res.status(400).send("No valid dates in tasks");

        minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    }

    // Normalize range
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

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
        const validTasks = tasks.filter((t: any) => !isNaN(new Date(t.date).getTime()));
        const createdTasks = [];
        for (const [index, t] of validTasks.entries()) {
            try {
                const taskDate = new Date(t.date);
                const mealPlanId = t.relatedMealPlanId ? parseInt(String(t.relatedMealPlanId)) : null;
                const recipeId = t.relatedRecipeId ? parseInt(String(t.relatedRecipeId)) : null;

                // Serialize list fields to CSV strings for standard columns
                const relatedMealPlanIdsStr = t.relatedMealPlanIds ? t.relatedMealPlanIds.join(',') : null;
                const relatedMealDatesStr = t.relatedMealDates ? t.relatedMealDates.join(',') : null;

                // relatedRecipeTitle is already a joined string "A, B" from the frontend service
                const relatedRecipeTitlesStr = t.relatedRecipeTitle || null;

                const newTask = await prisma.mealTask.create({
                    data: {
                        date: taskDate,
                        type: String(t.type || 'Generic'),
                        description: String(t.description || ''),
                        mealPlanId: mealPlanId,
                        recipeId: recipeId,
                        completed: false,

                        // New standard columns
                        relatedMealPlanIds: relatedMealPlanIdsStr,
                        relatedMealDates: relatedMealDatesStr,
                        relatedRecipeTitles: relatedRecipeTitlesStr
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
        const { startDate, endDate } = req.query;
        let where: any = {
            completed: false
        };

        if (startDate && endDate) {
            where.date = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
            };
        } else {
            // Default: Upcoming from today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            where.date = {
                gte: today
            };
        }

        const tasks = await prisma.mealTask.findMany({
            where: where,
            orderBy: {
                date: 'asc'
            },
            take: (startDate && endDate) ? undefined : 50, // Limit check if infinite scrolling not implemented, but allow full range if requested
            include: {
                recipe: {
                    select: { name: true }
                }
            }
        });

        res.json(tasks.map((t: any) => {
            // Deserialize CSV columns
            const relatedMealDates = t.relatedMealDates ? t.relatedMealDates.split(',') : [];
            const relatedMealPlanIds = t.relatedMealPlanIds ? t.relatedMealPlanIds.split(',').map((id: string) => parseInt(id)) : [];


            return {
                ...t,
                // New standard fields
                relatedMealDates,
                relatedMealPlanIds,
                relatedRecipeTitle: t.relatedRecipeTitles || t.recipe?.name, // For frontend compatibility
                recipeTitle: t.relatedRecipeTitles || t.recipe?.name
            };
        }));
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
