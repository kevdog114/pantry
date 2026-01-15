import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class EnvironmentService {
    private readonly env: any;

    constructor() {
        this.env = (window as any).__env || {};
    }

    get apiUrl(): string {
        return this.env.apiUrl || 'http://localhost:4300';
    }

    get siteName(): string {
        return this.env.siteName || 'My Pantry Site (Dev)';
    }
}
