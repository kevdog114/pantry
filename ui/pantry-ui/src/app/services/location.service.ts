import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Location } from "../types/product";
import { EnvironmentService } from "./environment.service";

@Injectable({
    providedIn: 'root'
})
export class LocationService {
    constructor(private http: HttpClient, private env: EnvironmentService) {
    }

    private getUrl = (path: string): string => {
        return this.env.apiUrl + path;
    }

    public getAll = (): Observable<Location[]> => {
        return this.http.get<Location[]>(this.getUrl("/locations"))
    }

    public getById = (id: number): Observable<Location> => {
        return this.http.get<Location>(this.getUrl(`/locations/${id}`))
    }

    public create = (location: Partial<Location>): Observable<Location> => {
        return this.http.post<Location>(this.getUrl("/locations"), location);
    }

    public update = (id: number, location: Partial<Location>): Observable<Location> => {
        return this.http.put<Location>(this.getUrl(`/locations/${id}`), location);
    }

    public delete = (id: number): Observable<any> => {
        return this.http.delete(this.getUrl(`/locations/${id}`));
    }
}
