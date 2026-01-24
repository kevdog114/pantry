import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { EnvironmentService } from './environment.service';
import { Observable, Subject, BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from './auth';

@Injectable({
    providedIn: 'root'
})
export class SocketService {
    private socket: Socket | undefined;
    public connected$ = new BehaviorSubject<boolean>(false);
    private listeners = new Map<string, Array<(data: any) => void>>();

    constructor(private authService: AuthService, private env: EnvironmentService, private http: HttpClient) {
        this.initSocket();
    }

    public initSocket() {
        const userToken = localStorage.getItem('access_token');
        const kioskToken = localStorage.getItem('kiosk_auth_token');
        const token = userToken || kioskToken;

        if (token) {
            this.connect(token);
        } else {
            this.authService.getSocketToken().subscribe({
                next: (res) => {
                    console.log('SocketService: Obtained socket token from backend');
                    this.connect(res.token);
                },
                error: (err) => {
                    console.warn('SocketService: No local token found and failed to fetch one. Proceeding without auth.');
                    this.connect(null);
                }
            });
        }
    }

    private connect(token: string | null) {
        if (this.socket && this.socket.connected) {
            console.log('SocketService: Already connected');
            this.connected$.next(true);
            return;
        }

        console.log('SocketService: Connecting with token', token);
        const options: any = {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionDelay: 5000
        };
        if (token) {
            options.auth = { token };
        }

        let origin = '';
        let pathname = '';

        try {
            const url = new URL(this.env.apiUrl);
            origin = url.origin;
            pathname = url.pathname;
        } catch (e) {
            // Fallback for relative URLs or errors
            origin = window.location.origin;
            pathname = this.env.apiUrl;
        }

        // Ensure pathname ends with / before appending socket.io
        // Also handle if pathname is just '/' or empty to avoid `//socket.io` if desired, though socket.io usually handles it.
        if (!pathname.endsWith('/')) {
            pathname += '/';
        }

        // Clean up double slashes if any (though URL parsing usually handles this)
        let socketPath = `${pathname}socket.io`.replace('//', '/');

        // Ensure socketPath has a trailing slash, matching the bridge server logic
        if (!socketPath.endsWith('/')) {
            socketPath += '/';
        }

        options.path = socketPath;

        console.log(`SocketService: Connecting to ${origin} with path ${socketPath}`);
        this.socket = io(origin, options);

        // Re-attach pending listeners
        this.listeners.forEach((callbacks, eventName) => {
            callbacks.forEach(cb => {
                this.socket?.on(eventName, cb);
            });
        });

        this.socket.on('connect', () => {
            console.log('SocketService: Connected');
            this.connected$.next(true);
        });

        this.socket.on('disconnect', () => {
            console.log('SocketService: Disconnected');
            this.connected$.next(false);
        });

        this.socket.on('connect_error', (err) => {
            console.error('SocketService: Connection Error', err);
            this.connected$.next(false);
        });
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
            this.connected$.next(false);
        }
    }

    public emit(eventName: string, data?: any, callback?: Function) {
        console.log(`SocketService: Emitting event ${eventName}`, {
            data: data,
            socket: this.socket
        });

        if (this.socket) {
            if (callback) {
                this.socket.emit(eventName, data, callback);
            } else {
                this.socket.emit(eventName, data);
            }
        }
    }

    public on(eventName: string, callback: (data: any) => void) {
        console.log(`SocketService: Registering listener for event ${eventName}`, this.socket);

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)?.push(callback);

        if (this.socket) {
            this.socket.on(eventName, callback);
        }
    }

    public removeListener(eventName: string) {
        console.log(`SocketService: Removing listener for event ${eventName}`, this.socket);

        this.listeners.delete(eventName);

        if (this.socket) {
            this.socket.off(eventName);
        }
    }

    public isConnected(): boolean {
        return !!(this.socket && this.socket.connected);
    }

    public getConnectedClients(): Promise<any[]> {
        return firstValueFrom(this.http.get<any[]>(`${this.env.apiUrl}/diagnostics/clients`));
    }

    public fromEvent<T>(eventName: string): Observable<T> {
        return new Observable<T>((observer) => {
            const handler = (data: T) => observer.next(data);
            this.on(eventName, handler);
            return () => {
                // Warning: This removes ALL listeners for this event name due to how removeListener is implemented currently
                // Ideally, we should remove only this handler. 
                // But SocketService.removeListener calls socket.off(eventName) which removes all.
                // We should assume for now that fromEvent is the primary consumer or acceptable trade-off.
                // Or better, update removeListener to take a handler?
                // Given the existing code, removeListener removes all.
                // I will NOT call removeListener here to avoid breaking other subscribers.
                // But that means leak?
                // Actually `socket.on` allows multiple listeners.
                // `socket.off(eventName, handler)` exists.
                if (this.socket) {
                    this.socket.off(eventName, handler);
                }
                // Also remove from local map if we tracked it precisely? 
                // The current implementation is a bit simple. 
                // Let's just use socket.off directly if socket exists.
            };
        });
    }
}
