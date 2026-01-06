import { Request, Response, NextFunction } from 'express';

import prisma from '../lib/prisma';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
        // Validation for Kiosk Sessions
        if ((req.session as any).kioskId) {
            const kioskId = (req.session as any).kioskId;
            try {
                const kiosk = await prisma.kiosk.findUnique({ where: { id: kioskId } });
                if (!kiosk) {
                    // Kiosk was deleted/removed
                    req.logout(() => {
                        res.status(401).json({ message: 'Kiosk access revoked' });
                    });
                    return;
                }
            } catch (err) {
                console.error("Error checking kiosk status", err);
            }
        }
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};
