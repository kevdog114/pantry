import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KioskService } from '../../../services/kiosk.service';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';

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
        private router: Router
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
        let socketUrl = environment.apiUrl.replace('/api', '');
        if (socketUrl.endsWith('/')) {
            socketUrl = socketUrl.slice(0, -1);
        }

        // Pass withCredentials if needed for cookies, though handshake relies on token mostly? 
        // Actually the kiosk is unauthenticated initially.
        this.socket = io(socketUrl, {
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
