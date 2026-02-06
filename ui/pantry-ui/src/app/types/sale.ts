export interface RetailerSale {
    id: number;
    productName: string;
    productUrl?: string;
    retailer: string; // e.g., "Costco", "Target"
    salePrice?: number;
    originalPrice?: number;
    validFrom?: Date;
    validTo?: Date;
    imageUrl?: string;
    isActive: boolean;
    foundAt: Date;
    updatedAt: Date;
}
