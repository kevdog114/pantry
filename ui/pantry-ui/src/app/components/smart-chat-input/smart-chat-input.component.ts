import { Component, EventEmitter, Input, Output, OnDestroy, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../../services/environment.service';

@Component({
    selector: 'app-smart-chat-input',
    templateUrl: './smart-chat-input.component.html',
    styleUrls: ['./smart-chat-input.component.scss'],
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatFormFieldModule, MatInputModule, FormsModule]
})
export class SmartChatInputComponent implements OnDestroy {
    @Input() placeholder: string = 'Type a message...';
    @Input() disabled: boolean = false;
    @Input() enableImageUpload: boolean = true;
    @Input() autoSendAudio: boolean = false;

    @Input() enableAudio: boolean = true;

    // Optional pre-filled text
    @Input() set text(val: string) {
        this._text = val;
    }
    get text() { return this._text; }
    private _text: string = '';

    @Output() send = new EventEmitter<{ text: string, image?: File }>();
    @Output() typing = new EventEmitter<void>();

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('inputField') inputField!: ElementRef<HTMLInputElement>;

    isListening = false;
    isProcessingAudio = false;
    selectedImage: File | null = null;
    selectedImagePreview: string | ArrayBuffer | null = null;

    // Audio recording variables
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;

    constructor(
        private cd: ChangeDetectorRef,
        private ngZone: NgZone,
        private http: HttpClient,
        private env: EnvironmentService
    ) { }

    ngOnDestroy() {
        this.stopRecording();
    }

    async toggleListening() {
        if (this.isListening) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.processAudio();
            };

            this.mediaRecorder.start();
            this.isListening = true;
            this.cd.detectChanges();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            // Optionally set an error state or notify user
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isListening) {
            this.mediaRecorder.stop();
            this.isListening = false;
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            this.cd.detectChanges();
        }
    }

    processAudio() {
        if (this.audioChunks.length === 0) return;

        this.isProcessingAudio = true;
        this.cd.detectChanges();

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' }); // Use webm or wav depending on browser, generally webm is default
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        this.http.post<{ text: string }>(`${this.env.apiUrl}/speech/transcribe`, formData)
            .subscribe({
                next: (response) => {
                    this.ngZone.run(() => {
                        this._text = response.text || '';
                        this.isProcessingAudio = false;
                        this.cd.detectChanges();

                        if (this.autoSendAudio && this._text.trim()) {
                            this.sendMessage();
                        } else {
                            setTimeout(() => {
                                if (this.inputField) this.inputField.nativeElement.focus();
                            });
                        }
                    });
                },
                error: (error) => {
                    this.ngZone.run(() => {
                        console.error('Transcription failed:', error);
                        this.isProcessingAudio = false;
                        this.cd.detectChanges();
                    });
                }
            });
    }

    onImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.selectedImage = file;
            const reader = new FileReader();
            reader.onload = e => this.selectedImagePreview = e.target?.result || null;
            reader.readAsDataURL(file);
        }
    }

    clearImage() {
        this.selectedImage = null;
        this.selectedImagePreview = null;
        if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
        }
    }

    sendMessage() {
        if ((this.text.trim() || this.selectedImage) && !this.disabled) {
            this.send.emit({
                text: this.text,
                image: this.selectedImage || undefined
            });
            this.text = '';
            this.clearImage();
        }
    }

    triggerImageUpload() {
        this.fileInput.nativeElement.click();
    }
}
