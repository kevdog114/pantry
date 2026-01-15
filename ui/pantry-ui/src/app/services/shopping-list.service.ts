import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

export interface ShoppingListItem {
    id: number;
    shoppingListId: number;
    productId?: number;
    product?: any;
    name: string;
    quantity: number;
    unit?: string;
    checked: boolean;
    fromLogistics?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ShoppingList {
    id: number;
    name: string;
    items: ShoppingListItem[];
    createdAt: Date;
    updatedAt: Date;
}

@Injectable({
    providedIn: 'root'
})
export class ShoppingListService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/shopping-list`;
    }

    getShoppingList(): Observable<ShoppingList> {
        return this.http.get<ShoppingList>(this.apiUrl);
    }

    addItem(listId: number, item: any): Observable<ShoppingListItem> {
        return this.http.post<ShoppingListItem>(`${this.apiUrl}/${listId}/items`, item);
    }

    updateItem(itemId: number, updates: any): Observable<ShoppingListItem> {
        return this.http.put<ShoppingListItem>(`${this.apiUrl}/items/${itemId}`, updates);
    }

    deleteItem(itemId: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/items/${itemId}`);
    }

    clearChecked(listId: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${listId}/checked`);
    }
}
