import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Equipment } from '../types/equipment';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class EquipmentService {
    private apiUrl = `${environment.apiUrl}/equipment`;

    constructor(private http: HttpClient) { }

    getAll(): Observable<Equipment[]> {
        return this.http.get<Equipment[]>(this.apiUrl);
    }

    getById(id: number): Observable<Equipment> {
        return this.http.get<Equipment>(`${this.apiUrl}/${id}`);
    }

    create(equipment: any): Observable<Equipment> {
        return this.http.post<Equipment>(this.apiUrl, equipment);
    }

    update(id: number, equipment: any): Observable<Equipment> {
        return this.http.put<Equipment>(`${this.apiUrl}/${id}`, equipment);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/${id}`);
    }

    uploadFile(equipmentId: number, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post(`${this.apiUrl}/${equipmentId}/files`, formData);
    }
}
