import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface KioskTokenResponse {
    token: string;
    url: string;
}

export interface Kiosk {
    id: number;
    name: string;
    lastActive: string;
    createdAt: string;
}

export interface HardwareDevice {
    id: number;
    name: string;
    type: string;
    status: string;
    details?: string;
    lastSeen: string;
}

export interface Kiosk {
    id: number;
    name: string;
    lastActive: string;
    createdAt: string;
    devices?: HardwareDevice[];
}

@Injectable({
    providedIn: 'root'
})
export class KioskService {
    private apiUrl = `${environment.apiUrl}`;

    constructor(private http: HttpClient) { }

    generateToken(): Observable<KioskTokenResponse> {
        return this.http.post<KioskTokenResponse>(`${this.apiUrl}/kiosk/token`, {});
    }

    linkKiosk(token: string, name: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/kiosk/link`, { token, name });
    }

    getKiosks(): Observable<Kiosk[]> {
        return this.http.get<Kiosk[]>(`${this.apiUrl}/kiosk`);
    }

    kioskLogin(token: string, kioskId?: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/auth/kiosk-login`, { token, kioskId });
    }

    deleteKiosk(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/kiosk/${id}`);
    }
}
