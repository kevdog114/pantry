import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private baseUrl: string;

  constructor(private http: HttpClient, private env: EnvironmentService) {
    this.baseUrl = this.env.apiUrl + '/auth';
  }

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, credentials, { withCredentials: true });
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}, { withCredentials: true });
  }

  changePassword(passwords: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/password`, passwords, { withCredentials: true });
  }

  getUser(): Observable<any> {
    return this.http.get(`${this.baseUrl}/user`, { withCredentials: true });
  }

  getPersonalAccessTokens(): Observable<any> {
    return this.http.get(`${this.baseUrl}/personal-access-tokens`, { withCredentials: true });
  }

  createPersonalAccessToken(name: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/personal-access-tokens`, { name }, { withCredentials: true });
  }

  deletePersonalAccessToken(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/personal-access-tokens/${id}`, { withCredentials: true });
  }

  getSocketToken(): Observable<{ token: string }> {
    return this.http.get<{ token: string }>(`${this.env.apiUrl}/auth/socket-token`, { withCredentials: true });
  }
}
