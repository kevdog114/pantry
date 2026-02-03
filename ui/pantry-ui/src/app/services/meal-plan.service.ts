import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Recipe } from '../types/recipe';
import { EnvironmentService } from './environment.service';

import { Product } from '../types/product';

export interface MealPlan {
    id: number;
    date: string;
    recipeId?: number;
    recipe?: Recipe;
    productId?: number;
    product?: Product;
    quantity?: number;
    isLeftover?: boolean;
    actualYield?: number;
    mealType?: string;
    servingsConsumed?: number;
}

@Injectable({
    providedIn: 'root'
})
export class MealPlanService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/meal-plan`;
    }

    getMealPlan(startDate: string, endDate: string): Observable<MealPlan[]> {
        return this.http.get<MealPlan[]>(`${this.apiUrl}?startDate=${startDate}&endDate=${endDate}`);
    }

    addMealToPlan(date: Date, recipeId?: number, productId?: number, isLeftover?: boolean, quantity?: number, mealType?: string): Observable<MealPlan> {
        return this.http.post<MealPlan>(this.apiUrl, { date, recipeId, productId, isLeftover, quantity, mealType });
    }

    removeMealFromPlan(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }

    updateMealPlan(id: number, date: Date, quantity?: number, mealType?: string, servingsConsumed?: number): Observable<MealPlan> {
        return this.http.put<MealPlan>(`${this.apiUrl}/${id}`, { date, quantity, mealType, servingsConsumed });
    }

    saveLogisticsTasks(tasks: any[], startDate?: string, endDate?: string): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/tasks`, { tasks, startDate, endDate });
    }

    generateShoppingList(startDate: string, endDate: string): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/generate-shopping-list`, { startDate, endDate });
    }

    getUpcomingTasks(startDate?: string, endDate?: string): Observable<any[]> {
        let url = `${this.apiUrl}/tasks/upcoming`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }
        return this.http.get<any[]>(url);
    }

    completeTask(id: number, completed: boolean): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/tasks/${id}/complete`, { completed });
    }
}
