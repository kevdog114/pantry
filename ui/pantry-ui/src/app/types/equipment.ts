export interface Equipment {
    id: number;
    name: string;
    notes?: string;
    purchaseDate?: string | Date;
    files?: any[];
    createdAt: Date;
    updatedAt: Date;
}
