import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

export interface CustomBarcode {
    id: number;
    title: string;
    data: string;
    createdAt: string;
    updatedAt: string;
}

@Injectable({
    providedIn: 'root'
})
export class CustomBarcodeService {
    private apiUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.apiUrl = `${this.env.apiUrl}/custom-barcodes`;
    }

    getAll(): Observable<CustomBarcode[]> {
        return this.http.get<CustomBarcode[]>(this.apiUrl);
    }

    getById(id: number): Observable<CustomBarcode> {
        return this.http.get<CustomBarcode>(`${this.apiUrl}/${id}`);
    }

    create(barcode: { title: string; data: string }): Observable<CustomBarcode> {
        return this.http.post<CustomBarcode>(this.apiUrl, barcode);
    }

    update(id: number, barcode: { title: string; data: string }): Observable<CustomBarcode> {
        return this.http.put<CustomBarcode>(`${this.apiUrl}/${id}`, barcode);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    printLabel(id: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/${id}/print-label`, {});
    }

    printReceipt(id: number, includeTitle: boolean): Observable<any> {
        return this.http.post(`${this.apiUrl}/${id}/print-receipt`, { includeTitle });
    }
}
