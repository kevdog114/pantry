export interface FileMeta
{
    id: number
    filename: string
}

export interface StockItem
{
    id?: number,
    ProductId: number,
    quantity: number,
    expiration: Date

    ProductBarcodeId: number
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
    Files: Array<FileMeta>
    fileIds: Array<number>
    ProductBarcodes: Array<ProductBarcode>
    StockItems: Array<StockItem>
    Tags: Array<ProductTags>
    minExpiration?: Date
    quantityExpiringSoon?: number
    totalQuantity?: number
    
    freezerLifespanDays?: number | null,
    refrigeratorLifespanDays?: number | null,
    openedLifespanDays?: number | null
}