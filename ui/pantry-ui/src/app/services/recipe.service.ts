import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Recipe } from '../types/recipe';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class RecipeService {
    private apiUrl = `${environment.apiUrl}/recipes`;

    constructor(private http: HttpClient) { }

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
