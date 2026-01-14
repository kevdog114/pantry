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

        // Ask Gemini
        let days = 3; // Default
        try {
            const { model } = await getGeminiModel('feature_gemini_chat'); // Use chat model setting or fallback
            // We want a conservative estimate usually
            const prompt = `How many days are leftovers safely edible in the refrigerator for the recipe "${recipe.name}"? Return ONLY a single integer number of days (e.g. "3" or "4"). Do not include any text.`;
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`Gemini leftover estimate for ${recipe.name}: ${text}`);
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

        // Create Product
        // Check if we should create a new one or if one already exists for this recipe?
        // Requirement: "It should create a product record... Once the stock item is used up, the product should be deleted."
        // This implies transient products. So we always create a new one?
        // Or do we recycle if one exists with 0 stock?
        // Let's create a new one to be safe and distinct, so we can track specific leftovers (maybe from different dates).
        // Actually, if we track multiple, we might want date in name?
        // "Leftover: Recipe Name (Jan 14)"

        const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const product = await prisma.product.create({
            data: {
                title: `Leftover: ${recipe.name}`,
                isLeftover: true,
                leftoverRecipeId: recipe.id,
                trackCountBy: 'quantity' // Leftovers usually distinct containers
            }
        });

        // Create Stock Item
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + days);
        // Default expiration time to Noon to avoid timezone boundary issues
        expirationDate.setHours(12, 0, 0, 0);

        const stockItem = await prisma.stockItem.create({
            data: {
                productId: product.id,
                quantity: 1,
                expirationDate: expirationDate,
                frozen: false,
                opened: true, // It's cooked food, effectively "opened/exposed"
                openedDate: new Date()
            }
        });

        res.json({ product, stockItem });
    } catch (error) {
        console.error("Error creating leftover:", error);
        res.status(500).json({ error: "Failed to create leftover" });
    }
};
