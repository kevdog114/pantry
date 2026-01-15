import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { SocketService } from '../services/socket.service';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.css'
})
export class BarcodeScannerComponent implements OnInit, OnDestroy {
  scanMethod: 'camera' | 'manual' | 'remote' = 'camera';
  cameras: Array<{ id: string; label: string }> = [];
  selectedCameraId: string = '';
  manualBarcodeInput: string = '';
  private scanner: Html5Qrcode | null = null;
  isScanning = false;
  cameraError: string | null = null;

  // Remote Scanner Properties
  availableScanners: { id: number, name: string }[] = [];
  claimedScannerId: number | null = null;
  claimedScannerName: string | null = null;
  isKioskMode = false;

  constructor(
    private barcodeService: HardwareBarcodeScannerService,
    private socketService: SocketService,
    private http: HttpClient,
    private env: EnvironmentService
  ) { }

  async ngOnInit() {
    // Load preferences
    const savedMethod = localStorage.getItem('barcode_scan_method');
    if (savedMethod === 'camera' || savedMethod === 'manual' || savedMethod === 'remote') {
      this.scanMethod = savedMethod;
    }

    const savedCameraId = localStorage.getItem('barcode_camera_id');
    if (savedCameraId) {
      this.selectedCameraId = savedCameraId;
    }

    if (this.scanMethod === 'camera') {
      await this.initializeCamera();
    }

    this.isKioskMode = localStorage.getItem('kiosk_mode') === 'true';
    if (!this.isKioskMode) {
      // Refresh immediately
      this.refreshScanners();
    }
  }

  refreshScanners() {
    this.http.get<any[]>(`${this.env.apiUrl}/kiosk/scanners`).subscribe({
      next: (scanners) => {
        console.log("Received scanners via API:", scanners);
        this.availableScanners = scanners;
      },
      error: (err) => {
        console.error("Failed to fetch scanners:", err);
      }
    });
  }

  claimScanner(scanner: any) {
    this.socketService.emit('claim_scanner', scanner.id, (res: any) => {
      if (res.success) {
        this.claimedScannerId = scanner.id;
        this.claimedScannerName = scanner.name;
        this.onMethodChange('remote');
      } else {
        alert('Failed to claim scanner: ' + res.error);
        this.refreshScanners();
      }
    });
  }

  stopClaim() {
    if (this.claimedScannerId) {
      this.socketService.emit('release_scanner', this.claimedScannerId);
      this.claimedScannerId = null;
      this.claimedScannerName = null;
      this.refreshScanners();
      if (this.scanMethod === 'remote') {
        this.onMethodChange('camera');
      }
    }
  }

  ngOnDestroy() {
    this.stopScanner();
    // Auto-release on navigate away? Maybe not, user might want to browse while having claimed scanner.
    // The requirement says "after the web socket connection closes".
    // If we destroy this component, we don't close the socket.
    // So modifying the user flow:
    // "In order to support "claiming" ... option on the barcode scan page... When this is clicked... web socket connection... inputs should behave like..."
    // If I leave the page, do I keep the claim?
    // "On the kiosk... change the header color indicating scanner is claimed... stop claim button".
    // This implies the claim persists while navigating.
    // So I should NOT release in ngOnDestroy.
  }

  async onMethodChange(method: 'camera' | 'manual' | 'remote') {
    this.scanMethod = method;
    localStorage.setItem('barcode_scan_method', method);

    if (method === 'camera') {
      await this.initializeCamera();
    } else {
      await this.stopScanner();
    }
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
