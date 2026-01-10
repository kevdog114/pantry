import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KioskService, Kiosk } from '../../../services/kiosk.service';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { LabelService } from '../../../services/label.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-hardware-list',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule],
    templateUrl: './hardware-list.component.html',
    styleUrls: ['./hardware-list.component.css']
})
export class HardwareListComponent implements OnInit {
    kiosks: Kiosk[] = [];

    constructor(
        private kioskService: KioskService,
        private labelService: LabelService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit() {
        this.kioskService.getKiosks().subscribe(kiosks => {
            this.kiosks = kiosks;
        });
    }

    printTestLabel(device: any) {
        if (device.type === 'PRINTER' && (device.status === 'ONLINE' || device.status === 'READY')) {
            this.labelService.printQuickLabel('TEST').subscribe({
                next: (res) => {
                    this.snackBar.open('Test label sent to printer', 'Close', { duration: 3000 });
                },
                error: (err) => {
                    console.error('Print failed', err);
                    this.snackBar.open('Failed to send test label', 'Close', { duration: 3000 });
                }
            });
        }
    }

    getDeviceDetails(device: any): any {
        if (!device || !device.details) return {};
        try {
            return typeof device.details === 'string' ? JSON.parse(device.details) : device.details;
        } catch (e) {
            return {};
        }
    }

    configureDevice(device: any) {
        const details = this.getDeviceDetails(device);
        const config = details.config ?
            Object.entries(details.config).map(([k, v]) => `${k}: ${v}`).join(', ') :
            'No configuration detected.';

        this.snackBar.open(`Configuration: ${config}`, 'Close', { duration: 5000 });
    }
}
