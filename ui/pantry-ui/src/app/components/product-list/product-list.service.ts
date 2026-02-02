import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map } from 'rxjs/operators';
import { Product, StockItem } from "../../types/product";
import { EnvironmentService } from "../../services/environment.service";


@Injectable({
    providedIn: 'root'
})
export class ProductListService {
    constructor(private http: HttpClient, private env: EnvironmentService) {

    }

    private a = (b: string): string => {
        return this.env.apiUrl + b;
    }

    private enrichProducts = (products: Product[]): Product[] => {
        products.forEach(p => {
            if (p.stockItems && p.stockItems.length > 0) {
                if (p.totalQuantity === undefined || p.totalQuantity === null) {
                    p.totalQuantity = p.stockItems.reduce((acc, item) => acc + item.quantity, 0);
                }
                if (!p.minExpiration) {
                    const expirations = p.stockItems
                        .map(i => i.expirationDate ? new Date(i.expirationDate).getTime() : null)
                        .filter(d => d !== null) as number[];

                    if (expirations.length > 0) {
                        p.minExpiration = new Date(Math.min(...expirations));
                    }
                }
            }
        });
        return products;
    }

    public searchProducts = (searchQuery: string, locationId?: number): Observable<Product[]> => {
        let url = `/product-search?q=${encodeURIComponent(searchQuery)}`;
        if (locationId) {
            url += `&locationId=${locationId}`;
        }
        return this.http.get<Product[]>(this.a(url)).pipe(map(this.enrichProducts));
    }

    public GetAll = (locationId?: number): Observable<Product[]> => {
        let url = "/products";
        if (locationId) {
            url += `?locationId=${locationId}`;
        }
        return this.http.get<Product[]>(this.a(url)).pipe(map(this.enrichProducts));
    }

    public Get = (id: number): Observable<Product> => {
        return this.http.get<Product>(this.a(`/products/${id}`))
    }

    public Delete = (id: number): Observable<Product> => {
        return this.http.delete<Product>(this.a(`/products/${id}`))
    }

    public Update = (product: Product): Observable<Product> => {
        return this.http.put<Product>(this.a(`/products/${product.id}`), product);
    }

    public Create = (product: Product): Observable<Product> => {
        return this.http.post<Product>(this.a(`/products/`), product);
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

    public DeleteStock = (stockId: number): Observable<any> => {
        return this.http.delete(this.a(`/stock-items/${stockId}`));
    }
}