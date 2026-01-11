import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KioskService } from '../../../services/kiosk.service';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';
import { HardwareService } from '../../../services/hardware.service';

@Component({
    selector: 'app-kiosk-login',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './kiosk-login.component.html',
    styleUrls: ['./kiosk-login.component.css']
})
export class KioskLoginComponent implements OnInit, OnDestroy {
    qrCodeDataUrl: string = '';
    token: string = '';
    status: string = 'Initializing...';
    private socket: Socket | undefined;

    constructor(
        private kioskService: KioskService,
        private router: Router,
        private hardwareService: HardwareService
    ) { }

    ngOnInit() {
        this.status = 'Generating Token...';
        this.kioskService.generateToken().subscribe({
            next: (res) => {
                this.token = res.token;
                this.generateQRCode(res.url);
                this.connectSocket(res.token);
                this.status = 'Scan the QR code with your mobile device to log in.';
            },
            error: (err) => {
                this.status = 'Error generating token.';
                console.error(err);
            }
        });
    }

    generateQRCode(url: string) {
        QRCode.toDataURL(url)
            .then(url => {
                this.qrCodeDataUrl = url;
            })
            .catch(err => {
                console.error(err);
            });
    }

    connectSocket(token: string) {
        // Parse the API URL to determine the correct socket connection details.
        // This ensures WebSockets work even when deployed under a subpath (e.g. /api)
        // just like REST calls.
        let origin = '';
        let pathname = '';

        try {
            const url = new URL(environment.apiUrl);
            origin = url.origin;
            pathname = url.pathname;
        } catch (e) {
            // Fallback for relative URLs: use current origin
            origin = window.location.origin;
            pathname = environment.apiUrl;
        }

        // Ensure pathname ends with / before appending socket.io
        if (!pathname.endsWith('/')) {
            pathname += '/';
        }

        const socketPath = `${pathname}socket.io`;

        this.socket = io(origin, {
            path: socketPath,
            withCredentials: true
        });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket?.emit('join_kiosk', token);
        });

        this.socket.on('kiosk_linked', (data: any) => {
            console.log('Kiosk linked!', data);
            this.status = 'Linked! Logging in...';
            if (data.authToken) {
                this.kioskService.kioskLogin(data.authToken, data.kioskId).subscribe({
                    next: (res) => {
                        // Successfully logged in (cookie set)
                        console.log('Login success, attempting to connect hardware bridge...');
                        this.hardwareService.connectBridge(data.authToken, data.kioskName).subscribe({
                            next: (bridgeRes) => console.log('Hardware bridge connected', bridgeRes),
                            error: (err) => console.warn('Hardware bridge connection failed (ignore if not on Kiosk Device)', err)
                        });
                        this.router.navigate(['/']);
                    },
                    error: (err) => {
                        console.error("Login failed", err);
                        this.status = "Login failed after linking.";
                    }
                });
            }
        });
    }

    ngOnDestroy() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
