import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

export interface ShoppingTrip {
    id: number;
    date: Date;
    notes?: string;
    items?: any[];
}

@Injectable({
    providedIn: 'root'
})
export class ShoppingTripService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/shopping-trips`;
    }

    getShoppingTrips(startDate?: string, endDate?: string): Observable<ShoppingTrip[]> {
        let url = this.apiUrl;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }
        return this.http.get<ShoppingTrip[]>(url);
    }

    createShoppingTrip(date: Date, notes?: string): Observable<ShoppingTrip> {
        return this.http.post<ShoppingTrip>(this.apiUrl, { date, notes });
    }

    updateShoppingTrip(id: number, date?: Date, notes?: string): Observable<ShoppingTrip> {
        return this.http.put<ShoppingTrip>(`${this.apiUrl}/${id}`, { date, notes });
    }

    deleteShoppingTrip(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }

    assignItemsToTrip(tripId: number, itemIds: number[]): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${tripId}/assign-items`, { itemIds });
    }
}
