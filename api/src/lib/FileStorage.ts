import * as fs from 'fs';
import * as path from 'path';

export const UPLOAD_DIR = path.join(process.cwd(), 'data', 'upload') + '/';

export const storeFile = (tempPath: string, filename: string): void => {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    fs.copyFileSync(tempPath, UPLOAD_DIR + filename);
    fs.unlinkSync(tempPath);
};
