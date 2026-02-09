import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';

export const printLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    // Legacy endpoint
    res.status(501).json({ message: "Legacy endpoint not supported in new system yet." });
}

// Helper to send print command and wait for result
const sendPrintCommandAndWait = async (targetSocket: any, payload: any): Promise<{ success: boolean, message: string }> => {
    return new Promise((resolve, reject) => {
        const requestId = randomUUID();
        payload.requestId = requestId;

        const timeout = setTimeout(() => {
            cleanup();
            resolve({ success: false, message: "Print command timed out (no response from device)." });
        }, 15000); // 15 second timeout

        const listener = (data: any) => {
            if (data && data.requestId === requestId) {
                cleanup();
                resolve({
                    success: data.success,
                    message: data.message
                });
            }
        };

        const cleanup = () => {
            clearTimeout(timeout);
            targetSocket.off('print_complete', listener);
        };

        targetSocket.on('print_complete', listener);
        targetSocket.emit('print_label', payload);
    });
};

// Helper to find target socket
const findTargetSocket = async (io: any, deviceType: string = 'PRINTER'): Promise<any> => {
    const connectedSockets = await io.fetchSockets();

    for (const socket of connectedSockets) {
        const pat = (socket as any).pat;
        const clientType = (socket as any).clientType;

        if (!pat) continue;

        // Only target bridge connections, not frontend browser sessions
        if (clientType !== 'bridge') continue;

        if (pat.description && pat.description.startsWith('Kiosk Login - ')) {
            const kioskName = pat.description.substring('Kiosk Login - '.length);
            const kiosk = await prisma.kiosk.findFirst({
                where: { userId: pat.userId, name: kioskName },
                include: { devices: true }
            });

            if (kiosk) {
                const printer = kiosk.devices.find(d => d.type === deviceType && (d.status === 'ONLINE' || d.status === 'READY'));
                if (printer) {
                    return socket;
                }
            }
        }
    }
    return null;
}


export const printQuickLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const { type, date, size, copies } = req.body;
        const io = req.app.get('io');

        const targetSocket = await findTargetSocket(io);

        if (!targetSocket) {
            res.status(503).json({ message: "No online label printers found." });
            return;
        }

        const payload = {
            type: 'QUICK_LABEL',
            data: {
                type: type || "Label",
                date: date || new Date().toISOString().split('T')[0],
                size: size || 'continuous',
                copies: copies || 1
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Print successful." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing quick label', e);
        res.status(500).json({ message: "Failed to print test label" });
    }
}

export const printStockLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const stockId = parseInt(req.params.id);

        const stockItem = await prisma.stockItem.findUnique({
            where: { id: stockId },
            include: { product: true }
        });

        if (!stockItem) {
            res.status(404).json({ message: "Stock item not found" });
            return;
        }

        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io);

        if (!targetSocket) {
            res.status(503).json({ message: "No online label printers found." });
            return;
        }

        const { size, copies } = req.body;

        const payload = {
            type: 'STOCK_LABEL',
            data: {
                title: stockItem.product.title,
                expirationDate: stockItem.expirationDate ? stockItem.expirationDate.toISOString().split('T')[0] : 'N/A',
                quantity: stockItem.quantity,
                stockId: stockItem.id,
                qrData: `S2-${stockItem.id}`,
                size: size || 'standard',
                copies: copies || 1,
                frozen: stockItem.frozen,
                opened: stockItem.opened,
                // If opened, use openedDate.
                // If frozen, we now have frozenDate.
                openedDate: stockItem.openedDate ? stockItem.openedDate.toISOString().split('T')[0] : null,
                frozenDate: stockItem.frozenDate ? stockItem.frozenDate.toISOString().split('T')[0] : null,
                createdDate: stockItem.createdAt ? stockItem.createdAt.toISOString().split('T')[0] : null
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Label printed successfully." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing label', e);
        res.status(500).json({ message: "Failed to print label" });
    }
}
export const printModifierLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const { action, date, expiration } = req.body;
        const io = req.app.get('io');

        const targetSocket = await findTargetSocket(io);

        if (!targetSocket) {
            res.status(503).json({ message: "No online label printers found." });
            return;
        }

        const payload = {
            type: 'MODIFIER_LABEL',
            data: {
                action: action || "Modified",
                date: date || new Date().toISOString().split('T')[0],
                expiration: expiration || "N/A"
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Modifier label printed." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing modifier label', e);
        res.status(500).json({ message: "Failed to print modifier label" });
    }
}

export const printRecipeLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const recipeId = parseInt(req.params.id);
        const { size } = req.body;

        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId }
        });

        if (!recipe) {
            res.status(404).json({ message: "Recipe not found" });
            return;
        }

        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io);

        if (!targetSocket) {
            res.status(503).json({ message: "No online label printers found." });
            return;
        }

        const payload = {
            type: 'RECIPE_LABEL',
            data: {
                title: recipe.name,
                preparedDate: new Date().toISOString().split('T')[0],
                qrData: `R-${recipe.id}`,
                size: size || 'continuous'
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Label printed successfully." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing recipe label', e);
        res.status(500).json({ message: "Failed to print recipe label" });
    }
}
export const printAssetLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        const item = await prisma.equipment.findUnique({
            where: { id }
        });

        if (!item) {
            res.status(404).json({ message: "Equipment not found" });
            return;
        }

        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io);

        if (!targetSocket) {
            res.status(503).json({ message: "No online label printers found." });
            return;
        }

        const payload = {
            type: 'ASSET_LABEL',
            data: {
                name: item.name,
                purchaseDate: item.purchaseDate ? item.purchaseDate.toISOString().split('T')[0] : '',
                qrData: `E-${item.id}`
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Label printed." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }
    } catch (e) {
        console.error('Error printing asset label', e);
        res.status(500).json({ message: "Failed to print asset label" });
    }
}

import { generateReceiptSteps, determineSafeCookingTemps } from '../services/RecipeAIService';

export const printShoppingList = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io, 'RECEIPT_PRINTER');

        if (!targetSocket) {
            res.status(503).json({ message: "No online receipt printers found." });
            return;
        }

        // Fetch shopping list
        let list = await prisma.shoppingList.findFirst({
            include: {
                items: {
                    include: { product: true },
                    orderBy: { checked: 'asc' }
                }
            }
        });

        if (!list || !list.items || list.items.length === 0) {
            res.status(404).json({ message: "Shopping list is empty." });
            return;
        }

        const uncheckedItems = list.items.filter(i => !i.checked);
        const checkedItems = list.items.filter(i => i.checked);

        const payload = {
            type: 'SHOPPING_LIST',
            data: {
                title: 'Shopping List',
                date: new Date().toLocaleString("en-US", {
                    timeZone: "America/Chicago",
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }),
                items: uncheckedItems.map(i => ({
                    name: i.name || i.product?.title || 'Unknown',
                    quantity: i.quantity || 1,
                    checked: false
                })),
                checkedItems: checkedItems.map(i => ({
                    name: i.name || i.product?.title || 'Unknown',
                    quantity: i.quantity || 1,
                    checked: true
                })),
                totalItems: list.items.length,
                remainingItems: uncheckedItems.length
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Shopping list sent to printer." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing shopping list', e);
        res.status(500).json({ message: "Failed to print shopping list" });
    }
};

export const printReceipt = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const recipeId = parseInt(req.params.id);

        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            include: { steps: { orderBy: { stepNumber: 'asc' } }, ingredients: true, safeTemps: true }
        });

        if (!recipe) {
            res.status(404).json({ message: "Recipe not found" });
            return;
        }

        const io = req.app.get('io');
        // Find receipt printer
        const targetSocket = await findTargetSocket(io, 'RECEIPT_PRINTER');

        if (!targetSocket) {
            res.status(503).json({ message: "No online receipt printers found." });
            return;
        }

        let receiptData: any = { steps: [] };

        // Load existing
        if (recipe.receiptSteps) {
            try {
                receiptData = JSON.parse(recipe.receiptSteps);
            } catch (e) {
                console.warn("Invalid JSOn in receiptSteps, using defaults");
            }
        }

        // If no receipt steps found, generate them
        if ((!receiptData.steps || receiptData.steps.length === 0) && recipe.steps && recipe.steps.length > 0) {
            console.log(`[LabelPrinter] Generating receipt steps for recipe ${recipe.id}...`);
            try {
                const generatedJson = await generateReceiptSteps(recipe.name, recipe.ingredients, recipe.steps);

                if (generatedJson) {
                    // Update DB
                    await prisma.recipe.update({
                        where: { id: recipe.id },
                        data: { receiptSteps: generatedJson }
                    });

                    // Parse for current print job
                    try {
                        const parsed = JSON.parse(generatedJson);
                        if (parsed.steps) receiptData.steps = parsed.steps;
                    } catch (e) { }
                } else {
                    // Fallback simple map
                    receiptData.steps = recipe.steps.map(s => ({ action: "STEP", text: s.instruction }));
                }

            } catch (err) {
                console.warn("Failed to generate receipt steps", err);
                // Fallback
                receiptData.steps = recipe.steps.map(s => ({ action: "STEP", text: s.instruction }));
            }
        }

        // Ensure title is present
        receiptData.title = recipe.name;
        // Include minimal other metadata if useful?
        receiptData.yield = recipe.yield;
        receiptData.qrData = `R-${recipe.id}`;

        // Add Date
        receiptData.date = new Date().toLocaleString("en-US", {
            timeZone: "America/Chicago",
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        // Add ingredients to receipt data
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            receiptData.items = recipe.ingredients.map((ing: any) => {
                let qty = "";
                if (ing.amount !== null && ing.amount !== undefined) {
                    qty += ing.amount;
                }
                if (ing.unit) {
                    qty += " " + ing.unit;
                }
                return {
                    name: ing.name,
                    quantity: qty.trim()
                };
            });
        }

        // Add Safe Temps — lazy load from Gemini if missing
        let safeTemps = recipe.safeTemps || [];

        if (safeTemps.length === 0 && !recipe.noSafeTemps && recipe.ingredients && recipe.ingredients.length > 0) {
            console.log(`[LabelPrinter] No safe temps cached for recipe ${recipe.id}, querying Gemini...`);
            try {
                const generatedTemps = await determineSafeCookingTemps(recipe.ingredients);

                if (generatedTemps && generatedTemps.length > 0) {
                    // Store in DB for future prints
                    await prisma.recipe.update({
                        where: { id: recipe.id },
                        data: {
                            safeTemps: {
                                create: generatedTemps.map(st => ({
                                    item: st.item,
                                    temperature: st.temperature
                                }))
                            }
                        }
                    });
                    safeTemps = generatedTemps as any;
                } else {
                    // No key ingredients — set flag so we don't keep asking
                    console.log(`[LabelPrinter] No safe temp ingredients for recipe ${recipe.id}, setting noSafeTemps flag.`);
                    await prisma.recipe.update({
                        where: { id: recipe.id },
                        data: { noSafeTemps: true }
                    });
                }
            } catch (tempErr) {
                console.warn(`[LabelPrinter] Failed to generate safe temps for recipe ${recipe.id}:`, tempErr);
            }
        }

        if (safeTemps.length > 0) {
            receiptData.safeTemps = safeTemps.map((st: any) => ({
                item: st.item,
                temperature: st.temperature
            }));
        }

        const payload = {
            type: 'RECEIPT',
            data: receiptData
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Receipt sent to printer." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }

    } catch (e) {
        console.error('Error printing receipt', e);
        res.status(500).json({ message: "Failed to print receipt" });
    }
}
