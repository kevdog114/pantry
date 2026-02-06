/**
 * Unified tool handlers for Gemini AI.
 * This module consolidates all tool execution logic to avoid duplication
 * between streaming and non-streaming endpoints.
 */
import prisma from '../lib/prisma';
import { WeatherService } from '../services/WeatherService';
import { sendNotificationToUser } from '../controllers/PushController';
import {
    generateReceiptSteps,
    determineSafeCookingTemps,
    determineQuickActions
} from '../services/RecipeAIService';

// Types for tool handlers
export interface ToolContext {
    userId?: number;
    io?: any; // Socket.io instance
}

/**
 * Date utility: Add days to a date
 */
function addDays(dt: Date, days: number): Date {
    const newDt = new Date(dt);
    newDt.setDate(newDt.getDate() + days);
    return newDt;
}

/**
 * Date utility: Calculate days between two dates
 */
function daysBetween(dt1: Date, dt2: Date): number {
    const one = new Date(dt1); one.setHours(0, 0, 0, 0);
    const two = new Date(dt2); two.setHours(0, 0, 0, 0);
    const diff = one.getTime() - two.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Execute a tool by name with the given arguments.
 * Returns the result to be sent back to Gemini.
 */
export async function executeToolHandler(
    name: string,
    args: any,
    context: ToolContext = {}
): Promise<any> {
    console.log(`[ToolHandler] Executing tool ${name} with args:`, args);

    try {
        switch (name) {
            // ========================================
            // CONTEXT TOOLS (Read-Only)
            // ========================================

            case "getWeatherForecast": {
                const days = args.days || 5;
                try {
                    const service = new WeatherService();
                    const today = new Date();
                    const endDate = new Date();
                    endDate.setDate(today.getDate() + days - 1);
                    const forecasts = await service.getForecast(today, endDate);
                    if (!forecasts || forecasts.length === 0) {
                        return { message: "No weather forecast available." };
                    }
                    return {
                        forecasts: forecasts.map(f => ({
                            date: f.date.toISOString().split('T')[0],
                            condition: f.condition,
                            highTemp: f.highTemp,
                            lowTemp: f.lowTemp,
                            precipitationChance: f.precipitationChance
                        }))
                    };
                } catch (e) {
                    console.error("Weather tool error:", e);
                    return { error: "Weather service unavailable" };
                }
            }

            case "getFamilyPreferences": {
                const members = await prisma.familyMember.findMany();
                const generalPref = await prisma.systemSetting.findUnique({
                    where: { key: 'family_general_preferences' }
                });
                return {
                    generalPreferences: generalPref?.value || null,
                    members: members.map(m => ({
                        name: m.name,
                        dateOfBirth: m.dateOfBirth ? m.dateOfBirth.toISOString().split('T')[0] : null,
                        preferences: m.preferences
                    }))
                };
            }

            case "getAvailableEquipment": {
                const equipment = await prisma.equipment.findMany();
                return {
                    equipment: equipment.map(e => ({
                        id: e.id,
                        name: e.name,
                        notes: e.notes
                    }))
                };
            }

            case "searchInventory": {
                const searchQuery = args.query?.toLowerCase() || '';
                const searchProducts = await prisma.product.findMany({
                    where: {
                        OR: [
                            { title: { contains: searchQuery } },
                            { tags: { some: { name: { contains: searchQuery } } } }
                        ]
                    },
                    include: {
                        stockItems: { include: { reservations: true } },
                        tags: { select: { name: true } }
                    }
                });
                return {
                    products: searchProducts.map(p => {
                        const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                        const totalReserved = p.stockItems.reduce((sum, s) =>
                            sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                        const earliestExp = p.stockItems
                            .filter(s => s.expirationDate)
                            .sort((a, b) => (a.expirationDate?.getTime() || 0) - (b.expirationDate?.getTime() || 0))[0]?.expirationDate;
                        return {
                            id: p.id,
                            title: p.title,
                            totalQuantity: totalQty,
                            reservedQuantity: totalReserved,
                            availableQuantity: totalQty - totalReserved,
                            trackCountBy: p.trackCountBy,
                            tags: p.tags.map(t => t.name),
                            earliestExpiration: earliestExp ? earliestExp.toISOString().split('T')[0] : null
                        };
                    })
                };
            }

            case "getAllProducts": {
                const allProducts = await prisma.product.findMany({
                    include: {
                        stockItems: { include: { reservations: true } },
                        tags: { select: { name: true } }
                    }
                });
                return {
                    products: allProducts.map(p => {
                        const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                        const totalReserved = p.stockItems.reduce((sum, s) =>
                            sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                        return {
                            id: p.id,
                            title: p.title,
                            totalQuantity: totalQty,
                            availableQuantity: totalQty - totalReserved,
                            trackCountBy: p.trackCountBy,
                            tags: p.tags.map(t => t.name)
                        };
                    })
                };
            }

            case "getStockExpiringSoon": {
                const lookAheadDays = args.days || 7;
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + lookAheadDays);
                const expiringStock = await prisma.stockItem.findMany({
                    where: {
                        expirationDate: {
                            gte: new Date(),
                            lte: futureDate
                        },
                        quantity: { gt: 0 }
                    },
                    include: { product: { select: { id: true, title: true } } },
                    orderBy: { expirationDate: 'asc' }
                });
                return {
                    expiringItems: expiringStock.map(s => ({
                        productId: s.product.id,
                        productTitle: s.product.title,
                        stockId: s.id,
                        quantity: s.quantity,
                        unit: s.unit,
                        expirationDate: s.expirationDate?.toISOString().split('T')[0],
                        frozen: s.frozen,
                        opened: s.opened
                    }))
                };
            }

            // ========================================
            // STOCK MANAGEMENT TOOLS
            // ========================================

            case "getStockEntries": {
                const product = await prisma.product.findUnique({
                    where: { id: args.productId },
                    include: { stockItems: true }
                });
                if (!product) return { error: "Product not found" };
                return { stockItems: product.stockItems };
            }

            case "createStockEntry": {
                const targetProduct = await prisma.product.findUnique({ where: { id: args.productId } });
                if (!targetProduct) return { error: "Product not found." };

                const newItem = await prisma.stockItem.create({
                    data: {
                        productId: args.productId,
                        quantity: args.quantity,
                        unit: args.unit || null,
                        expirationDate: args.expirationDate
                            ? new Date(args.expirationDate.includes('T') ? args.expirationDate : args.expirationDate + 'T12:00:00')
                            : null,
                        frozen: args.frozen || false,
                        opened: args.opened || false
                    }
                });
                return { message: "Stock item created. Please confirm this action to the user.", item: newItem };
            }

            case "editStockEntry": {
                const currentItem = await prisma.stockItem.findUnique({
                    where: { id: args.stockId },
                    include: { product: true }
                });
                if (!currentItem) return { error: "Stock item not found" };

                const formattedData: any = {};
                if (args.quantity !== undefined && args.quantity !== null) formattedData.quantity = args.quantity;
                if (args.unit !== undefined && args.unit !== null) formattedData.unit = args.unit;

                // Handle explicit date set
                if (args.expirationDate) {
                    formattedData.expirationDate = new Date(
                        args.expirationDate.includes('T') ? args.expirationDate : args.expirationDate + 'T12:00:00'
                    );
                }

                const now = new Date();
                const isFrozen = (args.frozen !== undefined && args.frozen !== null) ? args.frozen : currentItem.frozen;

                // --- OPENED Logic ---
                if (args.opened !== undefined && args.opened !== null) {
                    formattedData.opened = args.opened;
                    if (args.opened && !currentItem.opened) {
                        if (currentItem.product.openedLifespanDays !== null) {
                            if (isFrozen) {
                                formattedData.expirationExtensionAfterThaw = currentItem.product.openedLifespanDays;
                            } else {
                                formattedData.expirationDate = addDays(now, currentItem.product.openedLifespanDays);
                            }
                        }
                    }
                }

                // --- FROZEN Logic ---
                if (args.frozen !== undefined && args.frozen !== null) {
                    formattedData.frozen = args.frozen;

                    // Freezing
                    if (args.frozen && !currentItem.frozen) {
                        if (currentItem.product.freezerLifespanDays !== null) {
                            const currentExp = formattedData.expirationDate || currentItem.expirationDate;
                            if (currentExp) {
                                formattedData.expirationExtensionAfterThaw = daysBetween(currentExp, now);
                            }
                            formattedData.expirationDate = addDays(now, currentItem.product.freezerLifespanDays);
                        }
                    }
                    // Thawing
                    else if (!args.frozen && currentItem.frozen) {
                        const extDays = (formattedData.expirationExtensionAfterThaw !== undefined)
                            ? formattedData.expirationExtensionAfterThaw
                            : currentItem.expirationExtensionAfterThaw;

                        if (extDays !== null && extDays !== undefined) {
                            formattedData.expirationDate = addDays(now, extDays);
                        }
                    }
                }

                const updated = await prisma.stockItem.update({
                    where: { id: args.stockId },
                    data: formattedData
                });
                return { message: "Updated. Please confirm to the user.", item: updated };
            }

            case "deleteStockEntry": {
                await prisma.stockItem.delete({ where: { id: args.stockId } });
                return { message: "Deleted stock item " + args.stockId + ". Please confirm to the user." };
            }

            // ========================================
            // SHOPPING LIST TOOLS
            // ========================================

            case "getShoppingList": {
                const list = await prisma.shoppingList.findFirst({
                    include: {
                        items: {
                            include: { product: true },
                            orderBy: { checked: 'asc' }
                        }
                    }
                });
                if (!list) {
                    return { items: [], message: "Shopping list is empty." };
                }
                return {
                    listId: list.id,
                    name: list.name,
                    items: list.items.map(item => ({
                        id: item.id,
                        name: item.name,
                        quantity: item.quantity,
                        unit: item.unit,
                        checked: item.checked,
                        productId: item.productId,
                        productName: item.product?.title || null
                    }))
                };
            }

            case "addToShoppingList": {
                let shoppingList = await prisma.shoppingList.findFirst();
                if (!shoppingList) {
                    shoppingList = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });
                }

                // Check if item already exists to update quantity instead of duplicating
                const existingItem = await prisma.shoppingListItem.findFirst({
                    where: {
                        shoppingListId: shoppingList.id,
                        name: args.item
                    }
                });

                if (existingItem) {
                    const updatedItem = await prisma.shoppingListItem.update({
                        where: { id: existingItem.id },
                        data: {
                            quantity: args.quantity || 1,
                            unit: args.unit || existingItem.unit
                        }
                    });
                    return { message: "Updated shopping list item quantity. Please confirm this to the user.", item: updatedItem };
                }

                const newShoppingItem = await prisma.shoppingListItem.create({
                    data: {
                        shoppingListId: shoppingList.id,
                        name: args.item,
                        quantity: args.quantity || 1,
                        unit: args.unit || null
                    }
                });
                return { message: "Added to shopping list. Please confirm this to the user.", item: newShoppingItem };
            }

            case "updateShoppingListItem": {
                const itemToUpdate = await prisma.shoppingListItem.findUnique({
                    where: { id: args.itemId }
                });

                if (!itemToUpdate) {
                    return { error: `Shopping list item with ID ${args.itemId} not found.` };
                }

                const updateData: any = {};
                if (args.name !== undefined) updateData.name = args.name;
                if (args.quantity !== undefined) updateData.quantity = args.quantity;
                if (args.unit !== undefined) updateData.unit = args.unit;
                if (args.checked !== undefined) updateData.checked = args.checked;

                const updatedItem = await prisma.shoppingListItem.update({
                    where: { id: args.itemId },
                    data: updateData,
                    include: { product: true }
                });

                return {
                    message: `Updated ${updatedItem.name}. Please confirm to the user.`,
                    item: {
                        id: updatedItem.id,
                        name: updatedItem.name,
                        quantity: updatedItem.quantity,
                        unit: updatedItem.unit,
                        checked: updatedItem.checked
                    }
                };
            }

            case "removeFromShoppingList": {
                const sl = await prisma.shoppingList.findFirst();
                if (!sl) return { error: "No shopping list found" };

                const itemToDelete = await prisma.shoppingListItem.findFirst({
                    where: {
                        shoppingListId: sl.id,
                        name: { contains: args.item }
                    }
                });

                if (itemToDelete) {
                    await prisma.shoppingListItem.delete({ where: { id: itemToDelete.id } });
                    return { message: `Removed ${itemToDelete.name} from shopping list. Please confirm to the user.` };
                }
                return { error: `Item ${args.item} not found in shopping list.` };
            }

            case "removeShoppingListItemById": {
                const itemById = await prisma.shoppingListItem.findUnique({
                    where: { id: args.itemId }
                });

                if (!itemById) {
                    return { error: `Shopping list item with ID ${args.itemId} not found.` };
                }

                await prisma.shoppingListItem.delete({ where: { id: args.itemId } });
                return { message: `Removed ${itemById.name} from shopping list. Please confirm to the user.` };
            }

            // ========================================
            // RECIPE TOOLS
            // ========================================

            case "getProducts": {
                const queryProducts = await prisma.product.findMany({
                    where: { title: { contains: args.query } },
                    select: { id: true, title: true }
                });
                return queryProducts;
            }

            case "getRecipes":
            case "searchRecipes": {
                const recipes = await prisma.recipe.findMany({
                    where: { name: { contains: args.query || '' } },
                    select: { id: true, name: true, prepTime: true, cookTime: true }
                });
                return { recipes };
            }

            case "getRecipeDetails": {
                const fullRecipe = await prisma.recipe.findUnique({
                    where: { id: args.recipeId },
                    include: {
                        ingredients: true,
                        steps: { orderBy: { stepNumber: 'asc' } }
                    }
                });
                if (!fullRecipe) return { error: "Recipe not found" };
                return fullRecipe;
            }

            case "createRecipe": {
                const newRecipe = await prisma.recipe.create({
                    data: {
                        name: args.title,
                        description: args.description || '',
                        source: 'Gemini Assistant',
                        prepTime: args.prepTime,
                        cookTime: args.cookTime,
                        yield: args.yield,
                        totalTime: (args.prepTime || 0) + (args.cookTime || 0),
                        ingredientText: args.ingredients.map((i: any) => `${i.amount || ''} ${i.unit || ''} ${i.name}`).join('\n'),
                        receiptSteps: args.printSteps ? JSON.stringify({ steps: args.printSteps }) : null,
                        steps: {
                            create: (args.steps || []).map((step: string, idx: number) => ({
                                stepNumber: idx + 1,
                                instruction: step
                            }))
                        },
                        ingredients: {
                            create: (args.ingredients || []).map((ing: any) => ({
                                name: ing.name,
                                amount: ing.amount,
                                unit: ing.unit,
                                productId: ing.productId
                            }))
                        }
                    }
                });

                // Trigger AI enrichment in background
                try {
                    const mappedSteps = (args.steps || []).map((s: string) => ({ instruction: s }));
                    const mappedIngs = args.ingredients || [];

                    const [receiptSteps, safeTemps, quickActions] = await Promise.all([
                        generateReceiptSteps(newRecipe.name, mappedIngs, mappedSteps),
                        determineSafeCookingTemps(mappedIngs),
                        determineQuickActions(newRecipe.name, mappedIngs, mappedSteps)
                    ]);

                    const updates: any = {};
                    if (receiptSteps) updates.receiptSteps = receiptSteps;
                    if (safeTemps.length > 0) {
                        updates.safeTemps = { create: safeTemps };
                    }
                    if (quickActions.length > 0) {
                        updates.quickActions = { create: quickActions };
                    }

                    if (Object.keys(updates).length > 0) {
                        await prisma.recipe.update({
                            where: { id: newRecipe.id },
                            data: updates
                        });
                    }
                } catch (err) {
                    console.error("Failed to enrich Gemini-created recipe:", err);
                }

                return {
                    message: "Recipe created successfully. ID: " + newRecipe.id + ". Please confirm creation to the user.",
                    recipeId: newRecipe.id
                };
            }

            // ========================================
            // MEAL PLAN TOOLS
            // ========================================

            case "getMealPlan": {
                const start = new Date(args.startDate);
                const end = new Date(args.endDate);
                end.setHours(23, 59, 59);

                const plans = await prisma.mealPlan.findMany({
                    where: { date: { gte: start, lte: end } },
                    include: { recipe: { select: { name: true } } }
                });
                return plans.map(p => ({
                    id: p.id,
                    date: p.date.toISOString().split('T')[0],
                    recipeName: p.recipe.name,
                    recipeId: p.recipeId
                }));
            }

            case "addToMealPlan": {
                const dateStr = args.date.includes('T') ? args.date : `${args.date}T12:00:00`;

                if (!args.recipeId && !args.productId) {
                    return { error: "You must provide either a recipeId or a productId." };
                }

                const newPlan = await prisma.mealPlan.create({
                    data: {
                        date: new Date(dateStr),
                        recipeId: args.recipeId,
                        productId: args.productId
                    }
                });
                return { message: "Added meal plan. Please confirm this to the user.", planId: newPlan.id };
            }

            case "removeFromMealPlan": {
                await prisma.mealPlan.delete({ where: { id: args.mealPlanId } });
                return { message: "Removed meal from plan. Please confirm to the user." };
            }

            case "moveMealPlan": {
                await prisma.mealPlan.update({
                    where: { id: args.mealPlanId },
                    data: { date: new Date(args.newDate) }
                });
                return { message: "Moved meal plan. Please confirm to the user." };
            }

            // ========================================
            // TIMER TOOLS
            // ========================================

            case "getTimers": {
                const activeTimers = await prisma.timer.findMany({
                    where: { status: "RUNNING" }
                });
                const nowTime = new Date().getTime();
                const timersWithRemaining = activeTimers.map((t: any) => {
                    const start = new Date(t.startedAt).getTime();
                    const end = start + (t.duration * 1000);
                    const remaining = Math.max(0, Math.floor((end - nowTime) / 1000));
                    return {
                        id: t.id,
                        name: t.name,
                        durationSeconds: t.duration,
                        remainingSeconds: remaining
                    };
                }).filter((t: any) => t.remainingSeconds > 0);

                return { timers: timersWithRemaining };
            }

            case "createTimer": {
                const duration = args.durationSeconds;
                if (!duration || duration <= 0) return { error: "Invalid duration" };

                const newTimer = await prisma.timer.create({
                    data: {
                        name: args.name || "Timer",
                        duration: duration,
                        startedAt: new Date(),
                        status: "RUNNING"
                    }
                });
                return { message: "Timer started. Please confirm to the user.", timer: newTimer };
            }

            case "deleteTimer": {
                await prisma.timer.delete({ where: { id: args.timerId } });
                return { message: "Timer deleted. Please confirm to the user." };
            }

            // ========================================
            // OTHER TOOLS
            // ========================================

            case "printReceipt": {
                const { io, userId } = context;
                if (!io) return { error: "Socket.io service unavailable" };
                if (!userId) {
                    console.warn("[Gemini] printReceipt called but no user ID found in context.");
                    return { error: "User context not found. Cannot identify kiosk." };
                }

                const kiosks = await prisma.kiosk.findMany({
                    where: { userId },
                    include: { devices: true }
                });

                if (!kiosks || kiosks.length === 0) return { error: "No Kiosks found for your account." };

                // Find a printer
                let selectedKioskId = null;
                let selectedPrinterId = null;

                // 1. Look for explicit RECEIPT_PRINTER
                for (const k of kiosks) {
                    const printer = k.devices.find(d => d.type === 'RECEIPT_PRINTER');
                    if (printer) {
                        selectedKioskId = k.id;
                        try {
                            const det = JSON.parse(printer.details || '{}');
                            selectedPrinterId = det.identifier;
                        } catch { }
                        break;
                    }
                }

                // 2. Fallback to any PRINTER
                if (!selectedKioskId) {
                    for (const k of kiosks) {
                        const printer = k.devices.find(d => d.type === 'PRINTER');
                        if (printer) {
                            selectedKioskId = k.id;
                            try {
                                const det = JSON.parse(printer.details || '{}');
                                if (det.identifier) selectedPrinterId = det.identifier;
                            } catch { }
                            break;
                        }
                    }
                }

                // 3. Fallback to just the Last Active Kiosk
                if (!selectedKioskId) {
                    kiosks.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
                    selectedKioskId = kiosks[0].id;
                }

                console.log(`[Gemini] Printing receipt to Kiosk ${selectedKioskId}, Printer ${selectedPrinterId}`);

                io.to(`kiosk_device_${selectedKioskId}`).emit('print_label', {
                    type: 'RECEIPT',
                    printerId: selectedPrinterId,
                    requestId: `gemini-${Date.now()}`,
                    data: {
                        title: args.title,
                        text: args.text || '',
                        items: args.items || [],
                        footer: args.footer || 'Generated by Gemini'
                    }
                });

                return { message: "Print command sent to Kiosk. Please confirm this action to the user." };
            }

            case "createCookingInstruction": {
                const targetProd = await prisma.product.findUnique({ where: { id: args.productId } });
                if (!targetProd) return { error: "Product not found" };

                const newInstruction = await prisma.recipe.create({
                    data: {
                        name: `${targetProd.title} - ${args.method}`,
                        description: args.description || `Cooking instructions for ${targetProd.title}`,
                        type: 'instruction',
                        instructionForProductId: args.productId,
                        source: 'Gemini',
                        prepTime: args.prepTime,
                        cookTime: args.cookTime,
                        totalTime: (args.prepTime || 0) + (args.cookTime || 0),
                        steps: {
                            create: (args.steps || []).map((step: string, idx: number) => ({
                                stepNumber: idx + 1,
                                instruction: step
                            }))
                        }
                    }
                });
                return {
                    message: "Created cooking instruction. Please confirm to the user.",
                    type: "instruction",
                    instructionId: newInstruction.id
                };
            }

            case "sendPushNotification": {
                const { userId } = context;
                if (!userId) return { error: "User context not found." };
                await sendNotificationToUser(userId, args.title, args.body);
                return { message: `Notification sent. Please confirm to the user.` };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (e: any) {
        console.error(`[ToolHandler] Error executing ${name}:`, e);
        return { error: e.message };
    }
}
