import { Injectable } from '@angular/core';

export interface ScrollState {
    scrollTop: number;
    searchQuery?: string;
    showInstructions?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ScrollTrackingService {
    private storagePrefix = 'scroll_';

    save(routeKey: string, state: ScrollState): void {
        try {
            localStorage.setItem(`${this.storagePrefix}${routeKey}`, JSON.stringify(state));
        } catch (e) {
            // Ignore storage errors
        }
    }

    restore(routeKey: string): ScrollState | null {
        try {
            const data = localStorage.getItem(`${this.storagePrefix}${routeKey}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    clear(routeKey: string): void {
        try {
            localStorage.removeItem(`${this.storagePrefix}${routeKey}`);
        } catch (e) {
            // Ignore storage errors
        }
    }
}
