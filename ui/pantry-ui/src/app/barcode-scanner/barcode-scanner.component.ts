import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { SocketService } from '../services/socket.service';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';
import { KioskService, Kiosk } from '../services/kiosk.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.css'
})
export class BarcodeScannerComponent implements OnInit, OnDestroy {
  scanMethod: 'camera' | 'manual' | 'hardware' = 'camera';
  cameras: Array<{ id: string; label: string }> = [];
  selectedCameraId: string = '';
  manualBarcodeInput: string = '';
  private scanner: Html5Qrcode | null = null;
  isScanning = false;
  cameraError: string | null = null;

  isKioskMode = false;

  hardwareScanners: Kiosk[] = [];
  claimedScannerBy: string | null = null;
  claimedKioskId: number | null = null;
  private claimSub: Subscription | null = null;

  constructor(
    private barcodeService: HardwareBarcodeScannerService,
    private socketService: SocketService,
    private http: HttpClient,
    private env: EnvironmentService,
    private kioskService: KioskService
  ) { }

  async ngOnInit() {
    // Check for hardware scanners
    this.kioskService.getKiosks().subscribe(kiosks => {
      this.hardwareScanners = kiosks.filter(k =>
        (k.devices && k.devices.some(d => d.type === 'SCANNER' && d.status === 'ONLINE')) ||
        k.hasKeyboardScanner
      );
    });

    this.claimSub = this.barcodeService.claimedBy$.subscribe(by => {
      this.claimedScannerBy = by;
    });

    // Load preferences
    const savedMethod = localStorage.getItem('barcode_scan_method');
    if (savedMethod === 'camera' || savedMethod === 'manual' || savedMethod === 'hardware') {
      this.scanMethod = savedMethod as any;
    }

    const savedCameraId = localStorage.getItem('barcode_camera_id');
    if (savedCameraId) {
      this.selectedCameraId = savedCameraId;
    }

    if (this.scanMethod === 'camera') {
      await this.initializeCamera();
    }

    const savedKioskId = localStorage.getItem('claimed_kiosk_id');
    if (savedKioskId) {
      this.claimedKioskId = parseInt(savedKioskId);
    }

    this.isKioskMode = localStorage.getItem('kiosk_mode') === 'true';
  }

  ngOnDestroy() {
    this.stopScanner();
    if (this.claimSub) this.claimSub.unsubscribe();
  }

  async onMethodChange(method: 'camera' | 'manual' | 'hardware') {
    this.scanMethod = method;
    localStorage.setItem('barcode_scan_method', method);

    if (method === 'camera') {
      await this.initializeCamera();
    } else {
      await this.stopScanner();
    }
  }

  claimScanner(kiosk: Kiosk) {
    this.barcodeService.claimScanner(kiosk.id);
    this.claimedKioskId = kiosk.id;
    localStorage.setItem('claimed_kiosk_id', kiosk.id.toString());
  }

  async initializeCamera() {
    try {
      this.cameraError = null;
      // This method triggers permission request
      const devices = await Html5Qrcode.getCameras();

      if (devices && devices.length) {
        this.cameras = devices;

        // If selected camera is no longer available, pick the first one
        if (!this.selectedCameraId || !this.cameras.find(c => c.id === this.selectedCameraId)) {
          this.selectedCameraId = this.cameras[0].id;
          localStorage.setItem('barcode_camera_id', this.selectedCameraId);
        }

        await this.startScanner(this.selectedCameraId);
      } else {
        this.cameraError = 'No cameras found.';
      }
    } catch (err) {
      console.error('Error getting cameras', err);
      this.cameraError = 'Permission denied or error accessing camera.';
    }
  }

  async onCameraSelect(cameraId: string) {
    this.selectedCameraId = cameraId;
    localStorage.setItem('barcode_camera_id', cameraId);
    await this.stopScanner();
    await this.startScanner(cameraId);
  }

  async startScanner(cameraId: string) {
    if (this.scanner) {
      // already running or instance exists
      await this.stopScanner();
    }

    // Create instance but don't start yet
    // 'reader' is the HTML element ID
    this.scanner = new Html5Qrcode("reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39
      ]
    };

    try {
      this.isScanning = true;
      await this.scanner.start(
        cameraId,
        config,
        (decodedText) => {
          this.onScanSuccess(decodedText);
        },
        (errorMessage) => {
          // parse error, ignore it mostly
        }
      );
    } catch (err) {
      console.error("Error starting scanner", err);
      this.isScanning = false;
      this.cameraError = "Failed to start scanner.";
    }
  }

  async stopScanner() {
    if (this.scanner) {
      if (this.isScanning) {
        try {
          await this.scanner.stop();
        } catch (e) {
          console.error("Error stopping scanner", e);
        }
      }
      try {
        this.scanner.clear();
      } catch (e) {
        console.error("Error clearing scanner", e);
      }
      this.isScanning = false;
      this.scanner = null;
    }
  }

  onScanSuccess(decodedText: string) {
    console.log(`Scan result: ${decodedText}`);
    this.stopScanner();
    // Play a beep sound if possible? (optional)
    this.barcodeService.searchForBarcode(decodedText);
  }

  onManualSubmit() {
    if (this.manualBarcodeInput.trim()) {
      this.barcodeService.searchForBarcode(this.manualBarcodeInput.trim());
    }
  }
}
