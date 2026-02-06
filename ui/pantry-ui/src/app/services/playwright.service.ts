import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

export interface PlaywrightStatus {
    status: 'running' | 'error' | 'unknown';
    mcp: {
        host: string;
        port: number;
        connected: boolean;
        error?: string;
    };
    vnc: {
        host: string;
        port: number;
    };
}

export interface PlaywrightConfig {
    mcp: {
        host: string;
        port: number;
        endpoint: string;
    };
    vnc: {
        host: string;
        port: number;
        webUrl: string;
    };
}

export interface McpResponse {
    success: boolean;
    result?: unknown;
    error?: string;
}

export interface PageSnapshot {
    url?: string;
    title?: string;
    elements?: unknown[];
}

@Injectable({
    providedIn: 'root'
})
export class PlaywrightService {
    private baseUrl: string;

    constructor(private http: HttpClient, private env: EnvironmentService) {
        this.baseUrl = `${this.env.apiUrl}/playwright`;
    }

    /**
     * Get the status of the Playwright MCP container
     */
    getStatus(): Observable<PlaywrightStatus> {
        return this.http.get<PlaywrightStatus>(`${this.baseUrl}/status`);
    }

    /**
     * Get configuration for connecting to Playwright MCP
     */
    getConfig(): Observable<PlaywrightConfig> {
        return this.http.get<PlaywrightConfig>(`${this.baseUrl}/config`);
    }

    /**
     * Navigate to a URL
     */
    navigate(url: string): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/navigate`, { url });
    }

    /**
     * Get a snapshot of the current page
     */
    snapshot(): Observable<McpResponse> {
        return this.http.get<McpResponse>(`${this.baseUrl}/snapshot`);
    }

    /**
     * Click on an element
     */
    click(ref: string, options?: {
        element?: string;
        doubleClick?: boolean;
        button?: 'left' | 'right' | 'middle';
        modifiers?: string[];
    }): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/click`, { ref, ...options });
    }

    /**
     * Type text into an element
     */
    type(ref: string, text: string, options?: {
        element?: string;
        submit?: boolean;
    }): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/type`, { ref, text, ...options });
    }

    /**
     * Fill a form field
     */
    fill(ref: string, value: string, element?: string): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/fill`, { ref, value, element });
    }

    /**
     * Hover over an element
     */
    hover(ref: string, element?: string): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/hover`, { ref, element });
    }

    /**
     * Press a keyboard key
     */
    pressKey(key: string, modifiers?: string[]): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/press-key`, { key, modifiers });
    }

    /**
     * Select an option from a dropdown
     */
    select(ref: string, values: string[], element?: string): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/select`, { ref, values, element });
    }

    /**
     * Take a screenshot
     */
    screenshot(options?: { raw?: boolean; ref?: string; element?: string }): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/screenshot`, options || {});
    }

    /**
     * Go back in browser history
     */
    goBack(): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/go-back`, {});
    }

    /**
     * Go forward in browser history
     */
    goForward(): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/go-forward`, {});
    }

    /**
     * Close the browser
     */
    closeBrowser(): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/close`, {});
    }

    /**
     * Resize browser window
     */
    resize(width: number, height: number): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/resize`, { width, height });
    }

    /**
     * Wait for an element
     */
    waitFor(ref: string, options?: {
        element?: string;
        state?: 'attached' | 'detached' | 'visible' | 'hidden';
        timeout?: number;
    }): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/wait-for`, { ref, ...options });
    }

    /**
     * Get console messages
     */
    getConsoleMessages(level?: string): Observable<McpResponse> {
        const params = level ? `?level=${level}` : '';
        return this.http.get<McpResponse>(`${this.baseUrl}/console${params}`);
    }

    /**
     * Execute a generic MCP tool
     */
    executeTool(method: string, params?: Record<string, unknown>): Observable<McpResponse> {
        return this.http.post<McpResponse>(`${this.baseUrl}/tool`, { method, params });
    }
}
