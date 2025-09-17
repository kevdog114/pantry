import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import * as bcrypt from 'bcryptjs';

export const login = (req: Request, res: Response) => {
    res.json({ user: req.user });
};

export const logout = (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: 'Logged out successfully' });
    });
};

export const changePassword = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const { oldPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({
        where: {
            id: (req.user as any).id
        }
    });

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (!bcrypt.compareSync(oldPassword, user.password)) {
        return res.status(401).json({ message: 'Invalid password' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await prisma.user.update({
        where: {
            id: user.id
        },
        data: {
            password: hashedPassword
        }
    });

    res.json({ message: 'Password changed successfully' });
};

export const getCurrentUser = (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
}
