import { Request, Response, Router } from "express";
import { db } from "../../models";
import * as crypto from 'crypto';

export class PersonalAccessTokenController {
    public routes(router: Router) {
        router.get("/personal-access-tokens", this.index);
        router.post("/personal-access-tokens", this.create);
        router.delete("/personal-access-tokens/:id", this.delete);
    }

    public async index(req: Request, res: Response) {
        const user = req.user as any;
        const tokens = await db.PersonalAccessTokens.findAll({
            where: {
                userId: user.id
            },
            attributes: ['id', 'name', 'createdAt']
        });

        res.json(tokens);
    }

    public async create(req: Request, res: Response) {
        const user = req.user as any;
        const { name } = req.body;

        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const pat = await db.PersonalAccessTokens.create({
            name,
            token: hashedToken,
            userId: user.id
        });

        res.json({ ...pat.toJSON(), token });
    }

    public async delete(req: Request, res: Response) {
        const user = req.user as any;
        const { id } = req.params;

        await db.PersonalAccessTokens.destroy({
            where: {
                id,
                userId: user.id
            }
        });

        res.status(204).send();
    }
}
