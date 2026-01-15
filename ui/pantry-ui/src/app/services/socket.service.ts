import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { EnvironmentService } from './environment.service';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { AuthService } from './auth';

@Injectable({
    providedIn: 'root'
})
export class SocketService {
    private socket: Socket | undefined;
    public connected$ = new BehaviorSubject<boolean>(false);

    constructor(private authService: AuthService, private env: EnvironmentService) {
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
            this.connected$.next(true);
            return;
        }

        const options: any = {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 5000
        };
        if (token) {
            options.auth = { token };
        }

        this.socket = io(this.env.apiUrl, options);

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
