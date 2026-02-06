import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';
import { RetailerSale } from '../types/sale';

@Injectable({
    providedIn: 'root'
})
export class SalesService {
    private baseUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.baseUrl = `${this.env.apiUrl}/sales`;
    }

    getSales(): Observable<RetailerSale[]> {
        return this.http.get<RetailerSale[]>(this.baseUrl);
    }

    searchCostcoSales(): Observable<any> {
        return this.http.post(`${this.baseUrl}/search/costco`, {});
    }
}
