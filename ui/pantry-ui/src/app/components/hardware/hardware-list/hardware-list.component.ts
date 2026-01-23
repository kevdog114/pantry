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
import { HardwareBarcodeScannerService } from '../../../hardware-barcode-scanner.service';
import { SocketService } from '../../../services/socket.service';
import { FlashDialogComponent } from '../flash-dialog/flash-dialog.component';

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
        private hardwareService: HardwareService,
        private barcodeService: HardwareBarcodeScannerService,
        private socketService: SocketService
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

    claimScanner(kioskId: number) {
        this.barcodeService.claimScanner(kioskId);
        this.snackBar.open('Scanner claimed! Events will be sent to this device.', 'Close', { duration: 3000 });
    }

    // Scale Logic
    scaleStreamSub: any = null;
    currentWeight: number = 0;
    currentUnit: string = 'g';
    isReadingScale = false;
    currentScaleKioskId: number | null = null;
    currentScaleDevice: any = null;

    toggleScaleRead(device: any, kioskId: number) {
        if (this.currentScaleKioskId === kioskId && this.currentScaleDevice?.id === device.id) {
            // Stop reading
            this.stopScaleRead();
        } else {
            // Start reading
            this.startScaleRead(device, kioskId);
        }
    }

    startScaleRead(device: any, kioskId: number) {
        this.stopScaleRead(); // Stop any existing

        this.currentScaleKioskId = kioskId;
        this.currentScaleDevice = device;
        this.isReadingScale = true;

        // Subscribe to socket events for scale readings (broadcasted or directed)
        // The bridge emits 'scale_reading' with requestId='poll' for continuous updates
        // OR we could just listen generally.

        const handler = (data: any) => {
            // Check if it's from our kiosk/device? Bridge doesn't send kioskId in payload usually, 
            // but backend forwarding might.
            // If we assume 1 active scale read at a time for the user:
            if (data.success && data.data) {
                this.currentWeight = data.data.weight;
                this.currentUnit = data.data.unit;
            }
        };

        this.socketService.on('scale_reading', handler);
        this.scaleStreamSub = handler; // store ref to remove later
    }

    stopScaleRead() {
        if (this.scaleStreamSub) {
            this.socketService.removeListener('scale_reading');
            this.scaleStreamSub = null;
        }
        this.currentScaleKioskId = null;
        this.currentScaleDevice = null;
        this.isReadingScale = false;
        this.currentWeight = 0;
    }

    tareScale(device: any, kioskId: number) {
        const requestId = `tare_${Date.now()}`;
        this.snackBar.open('Taring...', 'Close', { duration: 2000 });

        const handler = (data: any) => {
            if (data.requestId === requestId) {
                this.socketService.removeListener('tare_complete');
                if (data.success) {
                    this.snackBar.open('Tare successful', 'Close', { duration: 3000 });
                } else {
                    this.snackBar.open('Tare failed: ' + data.message, 'Close', { duration: 3000 });
                }
            }
        };

        this.socketService.on('tare_complete', handler);
        this.socketService.emit('tare_scale', { kioskId, requestId });
    }

    calibrateScale(device: any, kioskId: number) {
        // Simple prompt for now, or use a dialog
        const weightStr = prompt("Enter known weight in grams (e.g. 100):");
        if (!weightStr) return;

        const weight = parseFloat(weightStr);
        if (isNaN(weight) || weight <= 0) {
            alert("Invalid weight");
            return;
        }

        const requestId = `cal_${Date.now()}`;
        this.snackBar.open('Calibrating...', 'Close', { duration: 2000 });

        const handler = (data: any) => {
            if (data.requestId === requestId) {
                this.socketService.removeListener('calibration_complete');
                if (data.success) {
                    this.snackBar.open('Calibration successful', 'Close', { duration: 3000 });
                } else {
                    this.snackBar.open('Calibration failed: ' + data.message, 'Close', { duration: 3000 });
                }
            }
        };

        this.socketService.on('calibration_complete', handler);
        this.socketService.emit('calibrate_scale', { kioskId, requestId, weight });
    }

    openFlashDialog(kioskId: number) {
        this.dialog.open(FlashDialogComponent, {
            data: { kioskId },
            width: '500px',
            disableClose: true
        });
    }

    ngOnDestroy() {
        this.stopScaleRead();
    }
}
