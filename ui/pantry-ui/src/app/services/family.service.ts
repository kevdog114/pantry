import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FamilyMember {
    id: number;
    name: string;
    dateOfBirth?: string;
    preferences: string;
}

@Injectable({
    providedIn: 'root'
})
export class FamilyService {
    private apiUrl = `${environment.apiUrl}/family`;

    constructor(private http: HttpClient) { }

    getMembers(): Observable<FamilyMember[]> {
        return this.http.get<FamilyMember[]>(`${this.apiUrl}/members`);
    }

    createMember(member: Partial<FamilyMember>): Observable<FamilyMember> {
        return this.http.post<FamilyMember>(`${this.apiUrl}/members`, member);
    }

    updateMember(id: number, member: Partial<FamilyMember>): Observable<FamilyMember> {
        return this.http.put<FamilyMember>(`${this.apiUrl}/members/${id}`, member);
    }

    deleteMember(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/members/${id}`);
    }

    getGeneralPreferences(): Observable<{ preferences: string }> {
        return this.http.get<{ preferences: string }>(`${this.apiUrl}/preferences`);
    }

    saveGeneralPreferences(preferences: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/preferences`, { preferences });
    }
}
