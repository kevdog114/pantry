import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {

  private apiUrl = `${environment.apiUrl}/gemini/chat`;

  constructor(private http: HttpClient) { }

  sendMessage(prompt: string, history: any[], sessionId?: number, image?: File): Observable<any> {
    if (image) {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (sessionId) {
        formData.append('sessionId', sessionId.toString());
      }
      formData.append('image', image);
      return this.http.post<any>(this.apiUrl, formData);
    }
    return this.http.post<any>(this.apiUrl, { prompt, history, sessionId });
  }

  getSessions(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/sessions`);
  }

  getSession(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/sessions/${id}`);
  }

  deleteSession(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/sessions/${id}`);
  }

  getExpirationSuggestion(productTitle: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/gemini/expiration`, { productTitle });
  }

  quickSuggest(tags: string[], selectedMemberIds?: number[]): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/gemini/quick-suggest`, { tags, selectedMemberIds });
  }

  getThawAdvice(items: string[]): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/gemini/thaw-advice`, { items });
  }

  getAvailableModels(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/gemini/models`);
  }
}
