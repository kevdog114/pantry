import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

import prisma from '../lib/prisma';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
    // Check for Personal Access Token (Bearer)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        try {
            const pat = await prisma.personalAccessToken.findUnique({
                where: { token: hashedToken },
                include: { user: true }
            });

            if (pat && pat.user) {
                // Attach user to request to simulate passport authentication
                req.user = pat.user;
                return next();
            }
        } catch (err) {
            console.error("Error verifying PAT", err);
        }
    }

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
