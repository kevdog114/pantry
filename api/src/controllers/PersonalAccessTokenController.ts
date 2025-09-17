import { Request, Response, Router } from "express";
import prisma from '../lib/prisma';
import * as crypto from 'crypto';

export class PersonalAccessTokenController {
    public routes(router: Router) {
        router.get("/personal-access-tokens", this.index);
        router.post("/personal-access-tokens", this.create);
        router.delete("/personal-access-tokens/:id", this.delete);
    }

    public async index(req: Request, res: Response) {
        const user = req.user as any;
        const tokens = await prisma.personalAccessToken.findMany({
            where: {
                userId: user.id
            },
            select: {
                id: true,
                description: true,
                createdAt: true
            }
        });

        res.json(tokens);
    }

    public async create(req: Request, res: Response) {
        const user = req.user as any;
        const { name } = req.body;

        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const pat = await prisma.personalAccessToken.create({
            data: {
                description: name,
                token: hashedToken,
                userId: user.id
            }
        });

        const { token: _, ...patWithoutToken } = pat;
        res.json({ ...patWithoutToken, token });
    }

    public async delete(req: Request, res: Response) {
        const user = req.user as any;
        const { id } = req.params;

        await prisma.personalAccessToken.deleteMany({
            where: {
                id: parseInt(id),
                userId: user.id
            }
        });

        res.status(204).send();
    }
}
