import { File } from "./file";

export interface Product {
    id: number;
    title: string;
    Files: File[];
    minExpiration: Date;
}
