import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KioskService, Kiosk } from '../../../services/kiosk.service';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { LabelService } from '../../../services/label.service';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DeviceConfigDialogComponent } from '../device-config-dialog/device-config-dialog.component';
import { HardwareService } from '../../../services/hardware.service';

@Component({
    selector: 'app-hardware-list',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule, MatSlideToggleModule, MatDialogModule],
    templateUrl: './hardware-list.component.html',
    styleUrls: ['./hardware-list.component.css']
})
export class HardwareListComponent implements OnInit {
    kiosks: Kiosk[] = [];

    constructor(
        private kioskService: KioskService,
        private labelService: LabelService,
        private snackBar: MatSnackBar,
        private dialog: MatDialog,
        private hardwareService: HardwareService
    ) { }

    ngOnInit() {
        this.loadKiosks();
    }

    loadKiosks() {
        this.kioskService.getKiosks().subscribe(kiosks => {
            this.kiosks = kiosks;
        });
    }

    toggleScanner(kiosk: Kiosk) {
        // Optimistic update
        const originalValue = kiosk.hasKeyboardScanner;
        kiosk.hasKeyboardScanner = !kiosk.hasKeyboardScanner;

        this.kioskService.updateKioskSettings(kiosk.id, { hasKeyboardScanner: !!kiosk.hasKeyboardScanner })
            .subscribe({
                next: () => {
                    this.snackBar.open('Settings updated', 'Close', { duration: 2000 });

                    // If we are modifying THIS kiosk's settings from the Kiosk itself,
                    // we need to update the local bridge configuration.
                    const currentKioskId = localStorage.getItem('kiosk_id');
                    if (currentKioskId && parseInt(currentKioskId) === kiosk.id) {
                        const authToken = localStorage.getItem('kiosk_auth_token');
                        if (authToken) {
                            // This call pushes the new scanner setting to kiosk_config.json on the bridge
                            this.hardwareService.connectBridge(authToken, kiosk.name, !!kiosk.hasKeyboardScanner).subscribe(
                                () => console.log('Bridge config updated'),
                                err => console.error('Failed to update bridge config', err)
                            );
                        }
                    }
                },
                error: (err) => {
                    console.error('Failed to update settings', err);
                    kiosk.hasKeyboardScanner = originalValue; // Revert
                    this.snackBar.open('Failed to update settings', 'Close', { duration: 3000 });
                }
            });
    }

    printTestLabel(device: any, kioskId: number) {
        if (device.type === 'RECEIPT_PRINTER') {
            this.kioskService.testReceiptPrinter(kioskId, device.id).subscribe({
                next: () => this.snackBar.open('Test receipt sent', 'Close', { duration: 3000 }),
                error: (err) => {
                    console.error('Test print failed', err);
                    this.snackBar.open('Failed to send test receipt', 'Close', { duration: 3000 });
                }
            });
        } else if (device.type === 'PRINTER' && (device.status === 'ONLINE' || device.status === 'READY')) {
            // Label Printer (Legacy/Global logic via labelService which finds ANY printer)
            // TODO: Update labelService to target specific printer if needed, but for now it works as "print to any available label printer"
            this.labelService.printQuickLabel('TEST', new Date(), 'continuous').subscribe({
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

    configureDevice(device: any, kioskId: number) {
        const details = this.getDeviceDetails(device);
        const currentConfig = details.config || {};

        const dialogRef = this.dialog.open(DeviceConfigDialogComponent, {
            data: { device, config: currentConfig },
            width: '400px'
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.kioskService.updateDeviceConfig(kioskId, device.id, result).subscribe({
                    next: (updatedDevice) => {
                        this.snackBar.open('Device configuration updated', 'Close', { duration: 3000 });
                        // Update local view
                        const kiosk = this.kiosks.find(k => k.id === kioskId);
                        if (kiosk && kiosk.devices) {
                            const devIndex = kiosk.devices.findIndex(d => d.id === device.id);
                            if (devIndex !== -1) {
                                kiosk.devices[devIndex] = { ...kiosk.devices[devIndex], ...updatedDevice };
                                // Re-parse details if needed or just trust details string was updated
                                if (updatedDevice.details) {
                                    kiosk.devices[devIndex].details = updatedDevice.details;
                                }
                            }
                        }
                    },
                    error: (err) => {
                        console.error('Failed to update config', err);
                        this.snackBar.open('Failed to update configuration', 'Close', { duration: 3000 });
                    }
                });
            }
        });
    }
}
