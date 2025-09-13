import { NextFunction, Response, Request } from "express";
import fs from "fs";

export const getGitInfo = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    fs.readFile("/app/git-info.json", "utf8", (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error reading git information");
            return;
        }
        res.setHeader("Content-Type", "application/json");
        res.send(data);
    });
}
