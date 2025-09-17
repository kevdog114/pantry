import app from "./app";
import prisma from './lib/prisma';
import * as crypto from "crypto";
import * as bcrypt from 'bcryptjs';

const createDefaultAdmin = async () => {
    const users = await prisma.user.findMany();
    if (users.length === 0) {
        const password = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);
        
        await prisma.user.create({
            data: {
                username: 'admin',
                password: hashedPassword,
            }
        });
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.log("!!! NO USERS FOUND, CREATED DEFAULT ADMIN WITH PASSWORD: !!!");
        console.log(`!!! admin:${password}                                    !!!`);
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    }
};

const server = app.listen(app.get("port"), async () => {
    await createDefaultAdmin();
    console.log(`App running on port ${app.get("port")}`);
})

export default server;
