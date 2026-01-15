import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Recipe } from "../../types/recipe";
import { EnvironmentService } from "../../services/environment.service";


@Injectable({
    providedIn: 'root'
})
export class RecipeListService {
    constructor(private http: HttpClient, private env: EnvironmentService) {

    }

    private buildApiUrl = (b: string): string => {
        return this.env.apiUrl + b;
    }

    public getAll = (): Observable<Recipe[]> => {
        return this.http.get<Recipe[]>(this.buildApiUrl("/recipes"))
    }

    public get = (id: number): Observable<Recipe> => {
        return this.http.get<Recipe>(this.buildApiUrl(`/recipes/${id}`))
    }

    public update = (recipe: Recipe): Observable<Recipe> => {
        return this.http.put<Recipe>(this.buildApiUrl(`/recipes/${recipe.id}`), recipe);
    }

    public create = (recipe: Partial<Recipe> | any): Observable<Recipe> => {
        return this.http.post<Recipe>(this.buildApiUrl(`/recipes/`), recipe);
    }

    public delete = (id: number): Observable<any> => {
        return this.http.delete(this.buildApiUrl(`/recipes/${id}`));
    }

    public createLeftover = (id: number): Observable<any> => {
        return this.http.post<any>(this.buildApiUrl(`/recipes/${id}/leftover`), {});
    }

}
