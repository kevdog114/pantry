import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { EnvironmentService } from './environment.service';

/** Emitted repeatedly while an image upload is still in flight. */
export interface UploadProgressEvent {
  kind: 'progress';
  loaded: number;
  total?: number;
  /** 0-100. Falls back to 0 while the total size is unknown. */
  percent: number;
}

/** Emitted once, when the server has replied. */
export interface UploadResponseEvent {
  kind: 'response';
  body: any;
}

export type UploadEvent = UploadProgressEvent | UploadResponseEvent;

export interface StreamEvent {
  type: 'session' | 'chunk' | 'done' | 'error' | 'tool_call' | 'meta';
  sessionId?: number;
  text?: string;
  data?: any;
  message?: string;
  toolCall?: {
    name: string;
    args: any;
  };
  // For early meta event (top-level properties)
  modelName?: string;
  usingCache?: boolean;
  // For done event (nested meta property)
  meta?: {
    usingCache?: boolean;
    modelName?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {

  private apiUrl: string;

  constructor(private http: HttpClient, private env: EnvironmentService) {
    this.apiUrl = `${this.env.apiUrl}/gemini/chat`;
  }

  sendMessage(prompt: string, history: any[], sessionId?: number, image?: File, additionalContext?: string, entityType?: string, entityId?: number): Observable<any> {
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
      if (entityType) formData.append('entityType', entityType);
      if (entityId) formData.append('entityId', entityId.toString());

      return this.http.post<any>(this.apiUrl, formData);
    }
    return this.http.post<any>(this.apiUrl, { prompt, history, sessionId, additionalContext, entityType, entityId });
  }

  /**
   * Same as sendMessage() for the image case, but reports upload progress.
   * Emits 'progress' events while the body is being sent, then a single
   * 'response' event carrying the parsed body.
   */
  sendMessageWithProgress(
    prompt: string,
    sessionId?: number,
    image?: File,
    additionalContext?: string,
    entityType?: string,
    entityId?: number
  ): Observable<UploadEvent> {
    const formData = new FormData();
    // Always send a prompt field: the server derives the session title from it.
    formData.append('prompt', prompt ?? '');
    if (sessionId) {
      formData.append('sessionId', sessionId.toString());
    }
    if (image) {
      formData.append('image', image);
    }
    if (additionalContext) {
      formData.append('additionalContext', additionalContext);
    }
    if (entityType) formData.append('entityType', entityType);
    if (entityId) formData.append('entityId', entityId.toString());

    return this.http
      .post<any>(this.apiUrl, formData, { observe: 'events', reportProgress: true })
      .pipe(
        filter(event => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
        map((event): UploadEvent => {
          if (event.type === HttpEventType.UploadProgress) {
            return {
              kind: 'progress',
              loaded: event.loaded,
              total: event.total,
              percent: event.total ? Math.round((100 * event.loaded) / event.total) : 0
            };
          }
          return { kind: 'response', body: (event as HttpResponse<any>).body };
        })
      );
  }

  /**
   * Sends a message with streaming enabled using Server-Sent Events.
   * Returns an Observable that emits StreamEvents for each chunk received.
   * Note: Images are not supported with streaming; use sendMessage for images.
   */
  sendMessageStream(prompt: string, sessionId?: number, additionalContext?: string, entityType?: string, entityId?: number): Observable<StreamEvent> {
    const subject = new Subject<StreamEvent>();

    const body = JSON.stringify({
      prompt,
      sessionId,
      additionalContext,
      entityType,
      entityId
    });

    // We need to use fetch with ReadableStream for SSE over POST
    fetch(`${this.apiUrl}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for cookies/auth
      body
    }).then(async response => {
      if (!response.ok) {
        subject.error(new Error(`HTTP ${response.status}: ${response.statusText}`));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        subject.error(new Error('Response body is not readable'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.substring(7);
            } else if (line.startsWith('data: ')) {
              currentData = line.substring(6);
            } else if (line === '' && currentEvent && currentData) {
              // End of event, emit it
              try {
                const parsed = JSON.parse(currentData);
                subject.next({
                  type: currentEvent as StreamEvent['type'],
                  ...parsed
                });
              } catch (e) {
                console.warn('Failed to parse SSE data:', currentData);
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err) {
        subject.error(err);
      } finally {
        subject.complete();
      }
    }).catch(err => {
      subject.error(err);
    });

    return subject.asObservable();
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

  planLogistics(startDate: string, endDate: string): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/logistics`, { startDate, endDate });
  }

  sortShoppingList(items: string[]): Observable<{ sortedItems: string[] }> {
    return this.http.post<any>(`${this.apiUrl.replace('/chat', '')}/shopping-list-sort`, { items });
  }

  lookupOpenFoodFacts(barcode: string): Observable<any> {
    return this.http.get<any>(`https://world.openfoodfacts.org/api/v2/product/${barcode}`);
  }

  getBarcodeDetails(productName: string, brand: string): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/barcode-details`, {
      productName,
      brand,
      existingProductTitle: ''
    });
  }

  analyzeProductImage(image: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', image);
    return this.http.post<any>(`${this.env.apiUrl}/gemini/analyze-image`, formData);
  }

  generateProductImage(productTitle: string): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/generate-image`, { productTitle });
  }

  generateRecipeImage(recipeTitle: string): Observable<any> {
    return this.http.post<any>(`${this.env.apiUrl}/gemini/generate-recipe-image`, { recipeTitle });
  }

  extractRecipeQuickActions(recipe: any): Observable<any> {
    const payload = {
      recipeId: recipe.id,
      title: recipe.title,
      ingredients: recipe.ingredients,
      steps: recipe.steps
    };
    return this.http.post<any>(`${this.env.apiUrl}/gemini/recipe-quick-actions`, payload);
  }

  getDebugLogs(sessionId: number): Observable<any> {
    return this.http.get<any>(`${this.env.apiUrl}/gemini/logs/${sessionId}`);
  }
}
