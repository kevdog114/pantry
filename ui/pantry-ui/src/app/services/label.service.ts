import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class LabelService {
  private apiUrl: string;

  constructor(private http: HttpClient, private env: EnvironmentService) {
    this.apiUrl = this.env.apiUrl;
  }

  printStockLabel(stockId: number, size: string = 'standard', copies: number = 1): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/stock/${stockId}`, { size, copies });
  }

  printQuickLabel(type: string, date: Date, size: string, copies: number = 1): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/quick-print`, {
      type,
      date: date.toISOString().split('T')[0], // YYYY-MM-DD
      size,
      copies
    });
  }

  printModifierLabel(action: string, date: string, expiration: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/modifier`, { action, date, expiration });
  }

  printRecipeLabel(recipeId: number, size: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/recipe/${recipeId}`, { size });
  }

  printReceipt(recipeId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/receipt/${recipeId}`, {});
  }
}
