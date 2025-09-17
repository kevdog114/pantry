export interface FileMeta
{
    id: number
    filename: string
}

export interface StockItem
{
    id?: number,
    productId: number,
    quantity: number,
    expiration: Date

    productBarcodeId: number
    isOpened: boolean
    isFrozen: boolean
    expirationExtensionAfterThaw: number
}

export interface ProductBarcode
{
    id: number,
    barcode: string,
    ProductId: number

    brand: string
    quantity: number
    description: string
    tags: Array<ProductTags>
}

export interface ProductTags
{
    id: number
    tagname: string
    taggroup: string
}

export interface Product
{
    id: number
    title: string
    files: Array<FileMeta>
    fileIds: Array<number>
    productBarcodes: Array<ProductBarcode>
    stockItems: Array<StockItem>
    tags: Array<ProductTags>
    minExpiration?: Date
    quantityExpiringSoon?: number
    totalQuantity?: number
    
    freezerLifespanDays?: number | null,
    refrigeratorLifespanDays?: number | null,
    openedLifespanDays?: number | null
}