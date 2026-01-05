import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SettingsService {

    private apiUrl = `${environment.apiUrl}/settings`;

    constructor(private http: HttpClient) { }

    getSettings(): Observable<any> {
        return this.http.get<any>(this.apiUrl);
    }

    updateSettings(settings: Record<string, string>): Observable<any> {
        return this.http.put<any>(this.apiUrl, settings);
    }
}
