import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';
import { KioskCommand } from '../types/kiosk-command';

@Injectable({
    providedIn: 'root'
})
export class KioskCommandService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}`;
    }

    getAll(): Observable<{ message: string, data: KioskCommand[] }> {
        return this.http.get<{ message: string, data: KioskCommand[] }>(`${this.apiUrl}/kiosk-commands`);
    }

    create(command: Partial<KioskCommand>): Observable<{ message: string, data: KioskCommand }> {
        return this.http.post<{ message: string, data: KioskCommand }>(`${this.apiUrl}/kiosk-commands`, command);
    }

    update(id: number, command: Partial<KioskCommand>): Observable<{ message: string, data: KioskCommand }> {
        return this.http.put<{ message: string, data: KioskCommand }>(`${this.apiUrl}/kiosk-commands/${id}`, command);
    }

    delete(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.apiUrl}/kiosk-commands/${id}`);
    }
}
