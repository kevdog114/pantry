import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const create = async (req: Request, res: Response) => {
    try {
        const recipeId = parseInt(req.params.id);
        const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });

        if (!recipe) {
            return res.status(404).json({ error: "Recipe not found" });
        }

        const { quantity, unit, customExpirationDate, trackBy } = req.body;
        const qty = quantity ? parseFloat(quantity) : 1;

        // Expiration Logic - default 3 months for frozen
        let expirationDate: Date;
        if (customExpirationDate) {
            expirationDate = new Date(customExpirationDate);
        } else {
            expirationDate = new Date();
            expirationDate.setMonth(expirationDate.getMonth() + 3);
            expirationDate.setHours(12, 0, 0, 0);
        }

        // Find or Create Product
        let product = await prisma.product.findFirst({
            where: {
                prepRecipeId: recipe.id,
                isPrep: true
            }
        });

        if (!product) {
            product = await prisma.product.create({
                data: {
                    title: `Prep: ${recipe.name}`,
                    isPrep: true,
                    prepRecipeId: recipe.id,
                    trackCountBy: trackBy === 'weight' ? 'weight' : 'quantity'
                }
            });
        } else {
            if (trackBy && product.trackCountBy !== trackBy) {
                await prisma.product.update({
                    where: { id: product.id },
                    data: { trackCountBy: trackBy }
                });
            }
        }

        // Create Stock Item (frozen, not opened)
        const stockItem = await prisma.stockItem.create({
            data: {
                productId: product.id,
                quantity: qty,
                unit: unit || null,
                expirationDate: expirationDate,
                frozen: true,
                opened: false,
                frozenDate: new Date()
            }
        });

        res.json({ product, stockItem });
    } catch (error) {
        console.error("Error creating prep:", error);
        res.status(500).json({ error: "Failed to create prep" });
    }
};
