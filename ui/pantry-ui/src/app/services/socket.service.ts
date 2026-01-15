import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { Observable, Subject, BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SocketService {
    private socket: Socket | undefined;
    public connected$ = new BehaviorSubject<boolean>(false);

    constructor() {
        this.initSocket();
    }

    public initSocket() {
        // Determine token: User token or Kiosk token
        const userToken = localStorage.getItem('access_token');
        const kioskToken = localStorage.getItem('kiosk_auth_token');
        const token = userToken || kioskToken;

        if (!token) {
            console.warn('SocketService: No token found, skipping connection');
            return;
        }

        if (this.socket && this.socket.connected) {
            this.connected$.next(true);
            return;
        }

        const apiUrl = environment.apiUrl;

        // Connect
        this.socket = io(apiUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 5000
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
        if (this.socket) {
            if (callback) {
                this.socket.emit(eventName, data, callback);
            } else {
                this.socket.emit(eventName, data);
            }
        }
    }

    public on(eventName: string, callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on(eventName, callback);
        }
    }

    public removeListener(eventName: string) {
        if (this.socket) {
            this.socket.off(eventName);
        }
    }

    public isConnected(): boolean {
        return !!(this.socket && this.socket.connected);
    }
}
