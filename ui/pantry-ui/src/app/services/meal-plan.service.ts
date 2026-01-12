import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Recipe } from '../types/recipe';

export interface MealPlan {
    id: number;
    date: string;
    recipeId: number;
    recipe: Recipe;
}

@Injectable({
    providedIn: 'root'
})
export class MealPlanService {
    private apiUrl = '/api/meal-plan';

    constructor(private http: HttpClient) { }

    getMealPlan(startDate: string, endDate: string): Observable<MealPlan[]> {
        return this.http.get<MealPlan[]>(`${this.apiUrl}?startDate=${startDate}&endDate=${endDate}`);
    }

    addMealToPlan(date: Date, recipeId: number): Observable<MealPlan> {
        return this.http.post<MealPlan>(this.apiUrl, { date, recipeId });
    }

    removeMealFromPlan(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }

    updateMealPlan(id: number, date: Date): Observable<MealPlan> {
        return this.http.put<MealPlan>(`${this.apiUrl}/${id}`, { date });
    }
}
