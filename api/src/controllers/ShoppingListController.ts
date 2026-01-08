
import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';

export const getShoppingList = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    let list = await prisma.shoppingList.findFirst({
        include: {
            items: {
                include: {
                    product: true
                },
                orderBy: {
                    checked: 'asc' // Unchecked first
                }
            }
        }
    });

    if (!list) {
        list = await prisma.shoppingList.create({
            data: {
                name: "My Shopping List"
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
    }

    res.send(list);
}

export const addItem = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const listId = parseInt(req.params.id);
    const { name, productId, quantity } = req.body;

    const item = await prisma.shoppingListItem.create({
        data: {
            shoppingListId: listId,
            name: name,
            productId: productId || null,
            quantity: quantity || 1
        },
        include: {
            product: true
        }
    });

    res.send(item);
}

export const updateItem = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const itemId = parseInt(req.params.itemId);
    const { quantity, checked } = req.body;

    const data: any = {};
    if (quantity !== undefined) data.quantity = quantity;
    if (checked !== undefined) data.checked = checked;

    const item = await prisma.shoppingListItem.update({
        where: { id: itemId },
        data: data,
        include: {
            product: true
        }
    });

    res.send(item);
}

export const deleteItem = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const itemId = parseInt(req.params.itemId);
    await prisma.shoppingListItem.delete({
        where: { id: itemId }
    });
    res.send({ success: true });
}

export const clearChecked = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const listId = parseInt(req.params.id);
    await prisma.shoppingListItem.deleteMany({
        where: {
            shoppingListId: listId,
            checked: true
        }
    });
    res.send({ success: true });
}
