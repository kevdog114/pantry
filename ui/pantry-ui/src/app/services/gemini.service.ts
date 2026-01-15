import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {

  private apiUrl: string;

  constructor(private http: HttpClient, private env: EnvironmentService) {
    this.apiUrl = `${this.env.apiUrl}/gemini/chat`;
  }

  sendMessage(prompt: string, history: any[], sessionId?: number, image?: File, additionalContext?: string): Observable<any> {
    if (image) {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (sessionId) {
        formData.append('sessionId', sessionId.toString());
      }
      formData.append('image', image);
      if (additionalContext) {
        formData.append('additionalContext', additionalContext);
      }
      return this.http.post<any>(this.apiUrl, formData);
    }
    return this.http.post<any>(this.apiUrl, { prompt, history, sessionId, additionalContext });
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

  getProductDetailsSuggestion(productTitle: string): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/product-details`, { productTitle });
  }

  quickSuggest(tags: string[], selectedMemberIds?: number[]): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/quick-suggest`, { tags, selectedMemberIds });
  }

  getThawAdvice(items: string[]): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/thaw-advice`, { items });
  }

  getAvailableModels(): Observable<any> {
    return this.http.get<any>(`${this.env.apiUrl}/gemini/models`);
  }

  sortShoppingList(items: string[]): Observable<{ sortedItems: string[] }> {
    return this.http.post<any>(`${this.apiUrl.replace('/chat', '')}/shopping-list-sort`, { items });
  }
}
