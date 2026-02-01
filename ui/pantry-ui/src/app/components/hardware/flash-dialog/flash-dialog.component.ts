import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { SocketService } from '../../../services/socket.service';

@Component({
  selector: 'app-flash-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    FormsModule
  ],
  template: `
    <h2 mat-dialog-title>Flash Firmware</h2>
    <mat-dialog-content>
      <div *ngIf="loadingPorts" class="flex flex-col items-center justify-center p-4">
        <mat-spinner diameter="30"></mat-spinner>
        <p class="mt-2 text-sm text-gray-500">Scanning for devices...</p>
      </div>

      <div *ngIf="!loadingPorts && !flashing">
        <p class="mb-4 text-gray-600">Select a device to flash the Scale Firmware to. This will erase the current firmware on the device.</p>
        
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Select Device</mat-label>
          <mat-select [(ngModel)]="selectedPort">
            <mat-option *ngFor="let port of ports" [value]="port.device">
              {{ port.device }} ({{ port.description || 'Unknown' }})
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
            <mat-label>Firmware</mat-label>
            <mat-select [(ngModel)]="selectedSketch">
                <mat-option value="scale/scale.ino">Scale (scale/scale.ino)</mat-option>
            </mat-select>
        </mat-form-field>

        <div *ngIf="error" class="p-3 bg-red-50 text-red-700 rounded text-sm mb-4">
          {{ error }}
        </div>
      </div>

      <div *ngIf="flashing" class="flex flex-col items-center justify-center p-6">
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        <p class="mt-4 font-medium">Flashing Firmware...</p>
        <p class="text-xs text-gray-500 mt-1">Please do not disconnect the device.</p>
      </div>

      <div *ngIf="flashResult" class="p-4 text-center">
        <mat-icon [class.text-green-500]="flashResult.success" [class.text-red-500]="!flashResult.success" class="text-4xl mb-2">
            {{ flashResult.success ? 'check_circle' : 'error' }}
        </mat-icon>
        <h3 class="font-bold">{{ flashResult.success ? 'Success!' : 'Failed' }}</h3>
        <p class="text-sm text-gray-600 mt-2">{{ flashResult.message }}</p>
        <div *ngIf="flashResult.details" class="text-xs bg-gray-100 p-2 mt-2 rounded overflow-auto max-h-32 text-left font-mono">
            {{ flashResult.details }}
        </div>
      </div>

    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()" [disabled]="flashing">Close</button>
      <button mat-flat-button color="primary" 
        (click)="flash()" 
        [disabled]="loadingPorts || flashing || !selectedPort || flashResult">
        Flash Device
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-form-field { width: 100%; }
  `]
})
export class FlashDialogComponent implements OnInit {
  loadingPorts = true;
  ports: any[] = [];
  selectedPort: string = '';
  selectedSketch: string = 'scale/scale.ino';
  flashing = false;
  error: string | null = null;
  flashResult: any = null;

  private requestId: string;

  constructor(
    public dialogRef: MatDialogRef<FlashDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { kioskId: number },
    private socketService: SocketService
  ) {
    this.requestId = `req_${Date.now()}`;
  }

  ngOnInit() {
    this.scanPorts();
  }

  scanPorts() {
    this.loadingPorts = true;
    this.error = null;

    const handler = (res: any) => {
      if (res.requestId === this.requestId) {
        this.loadingPorts = false;
        this.socketService.removeListener('serial_ports_list');
        if (res.success) {
          this.ports = res.ports || [];
          if (this.ports.length === 1) {
            this.selectedPort = this.ports[0].device;
          }
        } else {
          this.error = res.message || 'Failed to scan ports';
        }
      }
    };

    this.socketService.on('serial_ports_list', handler);

    // Ensure we are joined to the room
    this.socketService.emit('bind_to_kiosk', this.data.kioskId);

    this.socketService.emit('get_serial_ports', {
      kioskId: this.data.kioskId,
      requestId: this.requestId
    });

    // Timeout fallback
    setTimeout(() => {
      if (this.loadingPorts) {
        this.loadingPorts = false;
        this.error = "Scan timed out. Is the kiosk online?";
        this.socketService.removeListener('serial_ports_list');
      }
    }, 10000);
  }

  flash() {
    if (!this.selectedPort) return;

    this.flashing = true;
    this.error = null;

    const handler = (res: any) => {
      if (res.requestId === this.requestId) {
        this.flashing = false;
        this.socketService.removeListener('flash_complete');
        this.flashResult = res;
      }
    };

    this.socketService.on('flash_complete', handler);
    this.socketService.emit('flash_firmware', {
      kioskId: this.data.kioskId,
      port: this.selectedPort,
      sketch: this.selectedSketch,
      requestId: this.requestId
    });
  }

  close() {
    this.dialogRef.close(this.flashResult?.success);
  }
}
