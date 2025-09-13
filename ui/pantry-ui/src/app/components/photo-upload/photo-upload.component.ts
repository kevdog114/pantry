import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Product } from '../../../types/product';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule, MatButtonModule, HttpClientModule],
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

  constructor(private http: HttpClient) {}

  ngOnInit(): void {}

  startCamera() {
    this.isCameraOn = true;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        this.videoStream = stream;
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = stream;
        }
      })
      .catch(err => console.error('Error accessing camera:', err));
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

  retake() {
    this.capturedImage = null;
    this.startCamera();
  }

  uploadImage() {
    if (this.capturedImage) {
      const blob = this.dataURLtoBlob(this.capturedImage);
      const formData = new FormData();
      formData.append('file', blob, 'product-image.jpg');

      this.http.post<Product>(`${environment.apiUrl}/gemini/image`, formData)
        .subscribe(product => {
          this.uploadComplete.emit(product);
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
