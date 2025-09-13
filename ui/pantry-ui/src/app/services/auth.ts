import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private baseUrl = environment.apiUrl + '/auth';

  constructor(private http: HttpClient) { }

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
}
