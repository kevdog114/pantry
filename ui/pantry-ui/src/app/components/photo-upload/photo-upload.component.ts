import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { Product } from '../../../types/product';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule, MatButtonModule, HttpClientModule, MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule, FormsModule, MatSnackBarModule],
  templateUrl: './photo-upload.component.html',
  styleUrl: './photo-upload.component.css'
})
export class PhotoUploadComponent implements OnInit {
  @ViewChild('videoElement') videoElement?: ElementRef;
  @ViewChild('canvasElement') canvasElement?: ElementRef;

  @Output() uploadComplete = new EventEmitter<Product>();

  videoStream: MediaStream | null = null;
  capturedImage: string | null = null;
  isCameraOn = false;
  fileSelected = false;
  isLoading = false;
  cameras: MediaDeviceInfo[] = [];
  selectedDeviceId: string = '';

  constructor(private http: HttpClient, private router: Router, private snackBar: MatSnackBar) { }

  ngOnInit(): void {
    const savedDeviceId = localStorage.getItem('pantry_camera_device_id');
    this.startCamera(savedDeviceId || undefined);
  }

  getCameras() {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        this.cameras = devices.filter(device => device.kind === 'videoinput');
      })
      .catch(err => console.error('Error enumerating devices:', err));
  }

  startCamera(deviceId?: string) {
    this.isCameraOn = true;
    this.fileSelected = false;

    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined
      }
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        this.videoStream = stream;
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = stream;
        }
        // Enumerate devices after permission is granted to ensure labels are present
        this.getCameras();

        // Update selected device ID if not already set or if using default
        if (!deviceId) {
          const track = stream.getVideoTracks()[0];
          if (track) {
            const settings = track.getSettings();
            if (settings.deviceId) {
              this.selectedDeviceId = settings.deviceId;
            }
          }
        } else {
          this.selectedDeviceId = deviceId;
        }
      })
      .catch(err => {
        console.error('Error accessing camera:', err);
        // If specific device failed (e.g. unplugged), try fallback to default
        if (deviceId) {
          console.log('Falling back to default camera...');
          this.startCamera();
        } else {
          this.isCameraOn = false;
        }
      });
  }

  onCameraChange() {
    if (this.selectedDeviceId) {
      localStorage.setItem('pantry_camera_device_id', this.selectedDeviceId);
      this.stopCamera();
      this.startCamera(this.selectedDeviceId);
    }
  }

  captureImage() {
    if (this.videoElement && this.canvasElement) {
      const video = this.videoElement.nativeElement;
      const canvas = this.canvasElement.nativeElement;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      this.capturedImage = canvas.toDataURL('image/jpeg');
      this.stopCamera();
    }
  }

  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length) {
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.capturedImage = e.target.result;
        this.fileSelected = true;
        this.stopCamera();
      };
      reader.readAsDataURL(file);
    }
  }

  retake() {
    this.capturedImage = null;
    this.fileSelected = false;
    this.isCameraOn = false;
  }

  uploadImage() {
    if (this.capturedImage) {
      this.isLoading = true;
      const blob = this.dataURLtoBlob(this.capturedImage);
      const formData = new FormData();
      formData.append('file', blob, 'product-image.jpg');

      this.http.post<Product & { warning?: string }>(`${environment.apiUrl}/gemini/image`, formData)
        .subscribe(response => {
          this.isLoading = false;
          if (response.warning) {
            this.snackBar.open(response.warning, 'Close', { duration: 5000 });
          }
          this.uploadComplete.emit(response);
          this.router.navigate(['/product', response.id]);
        });
    }
  }

  private dataURLtoBlob(dataurl: string): Blob {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  private stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
      this.isCameraOn = false;
    }
  }
}
