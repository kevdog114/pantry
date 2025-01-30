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
}

export interface ProductBarcode
{
    id: number,
    barcode: string,
    ProductId: number
}

export interface Product
{
    id: number
    title: string
    Files: Array<FileMeta>
    fileIds: Array<number>
    ProductBarcodes: Array<ProductBarcode>
    StockItems: Array<StockItem>
    minExpiration?: Date
    quantityExpiringSoon?: number
    totalQuantity?: number
}