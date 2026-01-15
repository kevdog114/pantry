import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Recipe } from '../types/recipe';
import { EnvironmentService } from './environment.service';

@Injectable({
    providedIn: 'root'
})
export class RecipeService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/recipes`;
    }

    getAll(): Observable<Recipe[]> {
        return this.http.get<Recipe[]>(this.apiUrl);
    }

    getById(id: number): Observable<Recipe> {
        return this.http.get<Recipe>(`${this.apiUrl}/${id}`);
    }

    create(recipe: any): Observable<Recipe> {
        return this.http.post<Recipe>(this.apiUrl, recipe);
    }

    update(id: number, recipe: any): Observable<Recipe> {
        return this.http.put<Recipe>(`${this.apiUrl}/${id}`, recipe);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }
}
