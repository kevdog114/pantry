export interface FileMeta {
    id: number
    filename: string
    createdAt?: string
}

export interface StockItem {
    id?: number,
    productId: number,
    quantity: number,
    unit?: string
    expirationDate: Date

    productBarcodeId: number
    opened: boolean
    frozen: boolean
    expirationExtensionAfterThaw: number
    openedDate?: Date
    locationId?: number
    location?: Location
    reservations?: Array<{
        id: number
        amount: number
        mealPlanId: number
    }>
}

export interface Location {
    id: number
    name: string
    description: string
}

export interface ProductBarcode {
    id: number,
    barcode: string,
    ProductId: number

    brand: string
    quantity: number
    description: string
    tags: Array<ProductTags>
    tareWeight?: number
}

export interface ProductTags {
    id: number
    name: string
    group: string
}

export interface Product {
    id: number
    title: string
    files: Array<FileMeta>
    fileIds: Array<number>
    barcodes: Array<ProductBarcode>
    stockItems: Array<StockItem>
    tags: Array<ProductTags>
    minExpiration?: Date
    quantityExpiringSoon?: number
    totalQuantity?: number

    freezerLifespanDays?: number | null,
    refrigeratorLifespanDays?: number | null,
    openedLifespanDays?: number | null,
    pantryLifespanDays?: number | null,
    trackCountBy?: string,
    isLeftover?: boolean,
    leftoverRecipeId?: number,
    cookingInstructions?: Array<{
        id: number;
        name: string;
        description: string;
        steps: Array<{ stepNumber: number, instruction: string }>;
        prepTime?: number;
        cookTime?: number;
    }>
}