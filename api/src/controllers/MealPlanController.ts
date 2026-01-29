import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';
import { executeWithFallback } from "./GeminiController";

export const generateShoppingList = async (req: Request, res: Response): Promise<any> => {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).send("StartDate and EndDate required");

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const meals = await prisma.mealPlan.findMany({
            where: { date: { gte: start, lte: end } },
            include: {
                recipe: {
                    include: {
                        ingredients: {
                            include: {
                                product: {
                                    include: { stockItems: true }
                                }
                            }
                        }
                    }
                },
                product: {
                    include: { stockItems: true }
                }
            }
        });

        // Collect Data
        const requirements: any[] = [];
        const inventory: Record<string, any> = {};

        meals.forEach(meal => {
            const mealQty = meal.quantity || 1;

            if (meal.recipe) {
                meal.recipe.ingredients.forEach(ing => {
                    // Add to Requirements
                    requirements.push({
                        recipe: meal.recipe.name,
                        ingredientName: ing.name,
                        neededAmount: (ing.amount || 0) * mealQty, // Multiply by meal quantity
                        neededUnit: ing.unit,
                        linkedProduct: ing.product?.title || null
                    });

                    // Add to Inventory (once per product)
                    if (ing.product) {
                        const pTitle = ing.product.title;
                        if (!inventory[pTitle]) {
                            const stock = ing.product.stockItems || [];
                            const totalStock = stock.reduce((acc, item) => acc + item.quantity, 0);
                            inventory[pTitle] = {
                                totalStock: totalStock,
                                stockUnit: ing.product.trackCountBy || 'units'
                            };
                        }
                    }
                });
            } else if (meal.product) {
                // Standalone Product
                requirements.push({
                    recipe: "Direct Meal Item",
                    ingredientName: meal.product.title,
                    neededAmount: mealQty,
                    neededUnit: "count",
                    linkedProduct: meal.product.title
                });

                // Add to Inventory
                const pTitle = meal.product.title;
                if (!inventory[pTitle]) {
                    const stock = meal.product.stockItems || [];
                    const totalStock = stock.reduce((acc, item) => acc + item.quantity, 0);
                    inventory[pTitle] = {
                        totalStock: totalStock,
                        stockUnit: meal.product.trackCountBy || 'units'
                    };
                }
            }
        });

        if (requirements.length === 0) return res.send({ message: "No ingredients found in this range" });

        // Build Prompt
        const prompt = `
            I am planning meals and need to generate a shopping list.
            
            I have a list of 'Requirements' (ingredients needed for recipes) and a list of 'Inventory' (what I currently have in stock).
            
            INSTRUCTIONS:
            1. Group requirements by Product (or Ingredient Name if no product is linked).
            2. Sum up the total amount needed for each group.
            3. Check the 'Inventory' for that product.
            4. Calculate: (Total Needed) - (Inventory).
            5. If the result is greater than 0, add it to the shopping list.
            6. Handle unit conversions intelligently:
               - If ingredients use different units (e.g., cups vs oz), convert them to a common unit to sum them.
               - If appropriate, convert the final amount to standard package sizes (e.g., if need 8 oz of cheese and it comes in 8 oz blocks, say 1 block or package).
               - If conversion to packages is ambiguous, just list the total amount and unit (e.g. 1.5 lbs).
            7. If an ingredient is NOT linked to a product, assume I have 0 inventory and need to buy the full amount, UNLESS it is a common basic pantry staple like water, salt, pepper, or oil (in small quantities).
            
            OUTPUT:
            Return ONLY a JSON array of items to buy.
            Format: [{ "name": "Item Name", "quantity": number, "unit": "string", "reason": "Reason for buying" }]
            
            Examples:
            - { "name": "Cheddar Cheese", "quantity": 1, "unit": "package (8oz)", "reason": "Need 1 cup+1oz, approx 1 package" }
            - { "name": "Milk", "quantity": 0.5, "unit": "gallon", "reason": "Need 2 quarts" }
            
            --- INVENTORY ---
            ${JSON.stringify(inventory, null, 2)}
            
            --- REQUIREMENTS ---
            ${JSON.stringify(requirements, null, 2)}
        `;

        const { result } = await executeWithFallback('gemini_shopping_model', async (model) => {
            return await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });
        });

        const responseText = result.response.text();
        const json = JSON.parse(responseText);
        const itemsToBuy = Array.isArray(json) ? json : (json.items || []);

        // Add to Shopping List
        let list = await prisma.shoppingList.findFirst();
        if (!list) list = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });

        // Get all existing active logistics items to track what is still needed
        const existingLogisticsItems = await prisma.shoppingListItem.findMany({
            where: {
                shoppingListId: list.id,
                fromLogistics: true,
                checked: false
            }
        });
        const processedIds = new Set<number>();
        const createdItems = [];

        for (const item of itemsToBuy) {
            // Check for existing unchecked item with same name
            const existing = await prisma.shoppingListItem.findFirst({
                where: {
                    shoppingListId: list.id,
                    name: item.name,
                    checked: false
                }
            });

            if (existing) {
                if (existing.fromLogistics) {
                    // Update existing logistics item with NEW total (do not accumulate)
                    await prisma.shoppingListItem.update({
                        where: { id: existing.id },
                        data: {
                            quantity: item.quantity || 1,
                            unit: item.unit || null
                        }
                    });
                    processedIds.add(existing.id);
                    createdItems.push(existing);
                } else {
                    // Item exists but was manually added. Create a separate logistics entry.
                    const newItem = await prisma.shoppingListItem.create({
                        data: {
                            shoppingListId: list.id,
                            name: item.name,
                            quantity: item.quantity || 1,
                            unit: item.unit || null,
                            fromLogistics: true
                        }
                    });
                    createdItems.push(newItem);
                }
            } else {
                // Create new
                const newItem = await prisma.shoppingListItem.create({
                    data: {
                        shoppingListId: list.id,
                        name: item.name,
                        quantity: item.quantity || 1,
                        unit: item.unit || null,
                        fromLogistics: true
                    }
                });
                createdItems.push(newItem);
            }
        }

        // Cleanup: Remove logistics items that are no longer returned by the AI (stale requirements)
        for (const oldItem of existingLogisticsItems) {
            if (!processedIds.has(oldItem.id)) {
                console.log(`Removing stale logistics item: ${oldItem.name}`);
                await prisma.shoppingListItem.delete({ where: { id: oldItem.id } });
            }
        }

        res.json({ message: "Shopping list updated", items: createdItems });

    } catch (e: any) {
        console.error("Error generating shopping list:", e);
        res.status(500).json({ error: e.message });
    }
}



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
    end.setHours(23, 59, 59, 999);

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
                    prepTasks: true,
                    quickActions: true
                }
            },
            product: {
                include: {
                    stockItems: true
                }
            }
        }
    });
    res.send(meals.map(mapMealPlan));
}

export const addMealToPlan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { date, recipeId, productId } = req.body;
    console.log(`[Method: addMealToPlan] Request Body:`, req.body); // Debug log

    if (!date || (!recipeId && !productId)) {
        console.error("Missing date or recipeId or productId");
        return res.status(400).send("Date and RecipeId or ProductId are required");
    }

    try {
        const meal = await prisma.mealPlan.create({
            data: {
                date: new Date(date),
                recipeId: recipeId ? Number(recipeId) : undefined,
                productId: productId ? Number(productId) : undefined,
                quantity: req.body.quantity ? Number(req.body.quantity) : 1,
                unit: req.body.unit || null
            },
            include: {
                recipe: true,
                product: true
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
                date: (date) ? new Date(date) : undefined,
                quantity: req.body.quantity ? Number(req.body.quantity) : undefined,
                unit: req.body.unit || undefined
            },
            include: {
                recipe: true,
                product: true
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
