import { Request, Response } from "express";
import prisma from '../lib/prisma';
import { getGeminiModel } from "./GeminiController";

export const create = async (req: Request, res: Response) => {
    try {
        const recipeId = parseInt(req.params.id);
        const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });

        if (!recipe) {
            return res.status(404).json({ error: "Recipe not found" });
        }

        const { quantity, unit, customExpirationDate, trackBy } = req.body;
        const qty = quantity ? parseFloat(quantity) : 1;

        // Expiration Logic
        let expirationDate: Date;
        if (customExpirationDate) {
            expirationDate = new Date(customExpirationDate);
        } else {
            // Ask Gemini
            let days = 3; // Default
            try {
                const { model } = await getGeminiModel('feature_gemini_chat'); // Use chat model setting or fallback
                // We want a conservative estimate usually
                const prompt = `How many days are leftovers safely edible in the refrigerator for the recipe "${recipe.name}"? Return ONLY a single integer number of days (e.g. "3" or "4"). Do not include any text.`;
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                // console.log(`Gemini leftover estimate for ${recipe.name}: ${text}`);
                const match = text.match(/\d+/);
                if (match) {
                    days = parseInt(match[0]);
                    // Cap reasonable limits
                    if (days < 1) days = 1;
                    if (days > 7) days = 7;
                }
            } catch (e) {
                console.error("Gemini leftover estimate failed", e);
            }
            expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + days);
        }

        // Default expiration time to Noon
        expirationDate.setHours(12, 0, 0, 0);

        // Find or Create Product
        let product = await prisma.product.findFirst({
            where: {
                leftoverRecipeId: recipe.id,
                isLeftover: true
            }
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    title: `Leftover: ${recipe.name}`,
                    isLeftover: true,
                    leftoverRecipeId: recipe.id,
                    trackCountBy: trackBy === 'weight' ? 'weight' : 'quantity'
                }
            });
        } else {
            // Update tracking preference if needed?
            // If checking in a weight, better to ensure it's weight tracked?
            if (trackBy && product.trackCountBy !== trackBy) {
                // If switching types, we might want to update it.
                await prisma.product.update({
                    where: { id: product.id },
                    data: { trackCountBy: trackBy }
                });
            }
        }

        // Create Stock Item
        const stockItem = await prisma.stockItem.create({
            data: {
                productId: product.id,
                quantity: qty,
                unit: unit || null,
                expirationDate: expirationDate,
                frozen: false,
                opened: true, // It's cooked food, effectively "opened/exposed"
                openedDate: new Date()
            }
        });

        // Check for planned leftovers and link them
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const plannedLeftovers = await prisma.mealPlan.findMany({
            where: {
                recipeId: recipe.id,
                isLeftover: true,
                date: { gte: today }
            }
        });

        if (plannedLeftovers.length > 0) {
            console.log(`Linking created leftover to ${plannedLeftovers.length} planned meals.`);
            await prisma.mealPlan.updateMany({
                where: {
                    id: { in: plannedLeftovers.map(mp => mp.id) }
                },
                data: {
                    productId: product.id
                }
            });
        }

        res.json({ product, stockItem });
    } catch (error) {
        console.error("Error creating leftover:", error);
        res.status(500).json({ error: "Failed to create leftover" });
    }
};
