import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Recipe } from "../../types/recipe";
import { environment } from "../../../environments/environment";


@Injectable({
    providedIn: 'root'
})
export class RecipeListService
{
    constructor(private http: HttpClient) {

    }

    private a = (b: string): string => {
        return environment.apiUrl + b;
    }

    public getAll = (): Observable<Recipe[]> => {
        return this.http.get<Recipe[]>(this.a("/recipes"))
    }

    public get = (id: number): Observable<Recipe> => {
        return this.http.get<Recipe>(this.a(`/recipes/${id}`))
    }

    public update = (recipe: Recipe): Observable<Recipe> => {
        return this.http.put<Recipe>(this.a(`/recipes/${recipe.id}`), recipe);
    }

    public create = (recipe: Recipe): Observable<Recipe> => {
        return this.http.post<Recipe>(this.a(`/recipes/`), recipe);
    }
}
