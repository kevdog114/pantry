import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EnvironmentService } from '../services/environment.service';

@Injectable({
    providedIn: 'root'
})
export class SettingsService {

    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/settings`;
    }

    getSettings(): Observable<any> {
        return this.http.get<any>(this.apiUrl);
    }

    updateSettings(settings: Record<string, string>): Observable<any> {
        return this.http.put<any>(this.apiUrl, settings);
    }
}
