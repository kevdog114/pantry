import { Request, Response } from 'express';
import { db } from '../models';

export const login = (req: Request, res: Response) => {
    res.json({ user: req.user });
};

export const logout = (req: Request, res: Response, next) => {
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
    const user = await db.Users.findByPk((req.user as any).id);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (!user.validPassword(oldPassword)) {
        return res.status(401).json({ message: 'Invalid password' });
    }

    await user.update({ password: newPassword });

    res.json({ message: 'Password changed successfully' });
};

export const getCurrentUser = (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
}
