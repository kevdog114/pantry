import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class HardwareService {
    private localBridgeUrl = 'http://localhost:8080';

    constructor(private http: HttpClient) { }

    checkBridge(): Observable<any> {
        return this.http.get(`${this.localBridgeUrl}/health`).pipe(
            catchError(err => of(null))
        );
    }

    connectBridge(token: string): Observable<any> {
        let apiUrl = environment.apiUrl;
        // ensure full url if environment.apiUrl is relative
        if (apiUrl.startsWith('/')) {
            apiUrl = window.location.origin + apiUrl;
        }
        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);

        return this.http.post(`${this.localBridgeUrl}/connect`, { token, apiUrl }).pipe(
            catchError(err => {
                console.error('Failed to connect bridge', err);
                return of({ success: false, error: err })
            })
        );
    }
}
