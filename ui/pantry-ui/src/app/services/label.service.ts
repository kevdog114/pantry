import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LabelService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  printStockLabel(stockId: number, size: string = 'standard'): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/stock/${stockId}`, { size });
  }

  printQuickLabel(text: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/quick-print`, { text });
  }

  printModifierLabel(action: string, date: string, expiration: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/modifier`, { action, date, expiration });
  }

  printRecipeLabel(recipeId: number, size: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/labels/recipe/${recipeId}`, { size });
  }
}
