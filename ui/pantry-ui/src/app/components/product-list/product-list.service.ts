import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Product, StockItem } from "../../types/product";


@Injectable({
    providedIn: 'root'
})
export class ProductListService
{
    constructor(private http: HttpClient) {
        
    }

    public GetAll = (): Observable<Product[]> => {
        return this.http.get<Product[]>("http://localhost:4300/products")
    }

    public Get = (id: number): Observable<Product> => {
        return this.http.get<Product>(`http://localhost:4300/products/${id}`)
    }

    public Update = (product: Product): Observable<Product> => {
        return this.http.put<Product>(`http://localhost:4300/products/${product.id}`, product);
    }

    public UploadFile = (file: File): Observable<any> => {
        let formData: FormData = new FormData();
        formData.append("file", file, file.name);

        return this.http.post("http://localhost:4300/files", formData);
    }

    public CreateStock = (stockItem: StockItem): Observable<any> => {
        return this.http.post<StockItem>(`http://localhost:4300/stock-items/`, stockItem);
    }
    public UpdateStock = (stockId: number, stockItem: StockItem): Observable<any> => {
        return this.http.put<StockItem>(`http://localhost:4300/stock-items/${stockId}`, stockItem);
    }
}