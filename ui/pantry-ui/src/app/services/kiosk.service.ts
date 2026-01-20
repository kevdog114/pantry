import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

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
    hasKeyboardScanner?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class KioskService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}`;
    }

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

    updateKioskSettings(id: number, settings: { hasKeyboardScanner: boolean }): Observable<any> {
        return this.http.put(`${this.apiUrl}/kiosk/${id}/settings`, settings);
    }

    updateDeviceConfig(kioskId: number, deviceId: number, config: any): Observable<any> {
        return this.http.put(`${this.apiUrl}/kiosk/${kioskId}/devices/${deviceId}/config`, config);
    }

    testReceiptPrinter(kioskId: number, deviceId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/kiosk/${kioskId}/devices/${deviceId}/test-print`, {});
    }
}
