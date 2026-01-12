import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Recipe } from '../types/recipe';
import { environment } from '../../environments/environment';

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
    private apiUrl = `${environment.apiUrl}/meal-plan`;

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

    saveLogisticsTasks(tasks: any[]): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/tasks`, { tasks });
    }

    getUpcomingTasks(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/tasks/upcoming`);
    }

    completeTask(id: number, completed: boolean): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/tasks/${id}/complete`, { completed });
    }
}
