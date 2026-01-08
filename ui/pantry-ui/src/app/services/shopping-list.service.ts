
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ShoppingListItem {
    id: number;
    shoppingListId: number;
    productId?: number;
    product?: any;
    name: string;
    quantity: number;
    checked: boolean;
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
    private apiUrl = '/api/shopping-list';

    constructor(private http: HttpClient) { }

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
