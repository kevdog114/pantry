import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EnvironmentService } from '../services/environment.service';

export interface Cookbook {
    id: number;
    name: string;
    recipeCount?: number;
    recipes?: any[];
    _count?: { recipes: number };
}

@Injectable({
    providedIn: 'root'
})
export class CookbookService {
    constructor(private http: HttpClient, private env: EnvironmentService) { }

    private buildApiUrl = (b: string): string => {
        return this.env.apiUrl + b;
    }

    public getAll(): Observable<Cookbook[]> {
        return this.http.get<Cookbook[]>(this.buildApiUrl("/cookbooks"));
    }

    public getById(id: number): Observable<Cookbook> {
        return this.http.get<Cookbook>(this.buildApiUrl(`/cookbooks/${id}`));
    }

    public create(name: string, recipeIds?: number[]): Observable<Cookbook> {
        return this.http.post<Cookbook>(this.buildApiUrl("/cookbooks"), { name, recipeIds });
    }

    public update(id: number, name: string): Observable<Cookbook> {
        return this.http.put<Cookbook>(this.buildApiUrl(`/cookbooks/${id}`), { name });
    }

    public delete(id: number): Observable<void> {
        return this.http.delete<void>(this.buildApiUrl(`/cookbooks/${id}`));
    }

    public addRecipe(cookbookId: number, recipeId: number): Observable<Cookbook> {
        return this.http.post<Cookbook>(this.buildApiUrl(`/cookbooks/${cookbookId}/recipes/${recipeId}`), {});
    }

    public removeRecipe(cookbookId: number, recipeId: number): Observable<Cookbook> {
        return this.http.delete<Cookbook>(this.buildApiUrl(`/cookbooks/${cookbookId}/recipes/${recipeId}`));
    }
}
