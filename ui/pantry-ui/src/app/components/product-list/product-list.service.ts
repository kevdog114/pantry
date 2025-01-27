import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Product, StockItem } from "../../types/product";
import { environment } from "../../../environments/environment";


@Injectable({
    providedIn: 'root'
})
export class ProductListService
{
    constructor(private http: HttpClient) {
        
    }

    private a = (b: string): string => {
        return environment.apiUrl + b;
    }

    public GetAll = (): Observable<Product[]> => {
        return this.http.get<Product[]>(this.a("/products"))
    }

    public Get = (id: number): Observable<Product> => {
        return this.http.get<Product>(this.a(`/products/${id}`))
    }

    public Update = (product: Product): Observable<Product> => {
        return this.http.put<Product>(this.a(`/products/${product.id}`), product);
    }

    public UploadFile = (file: File): Observable<any> => {
        let formData: FormData = new FormData();
        formData.append("file", file, file.name);

        return this.http.post(this.a("/files"), formData);
    }

    public CreateStock = (stockItem: StockItem): Observable<any> => {
        return this.http.post<StockItem>(this.a(`/stock-items/`), stockItem);
    }
    public UpdateStock = (stockId: number, stockItem: StockItem): Observable<any> => {
        return this.http.put<StockItem>(this.a(`/stock-items/${stockId}`), stockItem);
    }
}