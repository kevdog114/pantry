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
import { SocketService } from '../../services/socket.service';

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
    private stream: MediaStream | null = null;

    // VAD variables
    private audioContext: AudioContext | null = null;
    private microphone: MediaStreamAudioSourceNode | null = null;

    constructor(
        private cd: ChangeDetectorRef,
        private ngZone: NgZone,
        private http: HttpClient,
        private env: EnvironmentService,
        private socketService: SocketService
    ) {
        this.socketService.on('speech_text', (data: any) => {
            if (this.isListening || this.isProcessingAudio) {
                this.ngZone.run(() => {
                    this._text = data.text;
                    this.cd.detectChanges();
                });
            }
        });
    }

    ngOnDestroy() {
        this.stopRecording();
        this.socketService.removeListener('speech_text');
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
            this.audioContext = new AudioContext();
            this.microphone = this.audioContext.createMediaStreamSource(this.stream);

            // Create ScriptProcessor for raw audio access
            const bufferSize = 4096;
            const scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

            this.microphone.connect(scriptProcessor);
            scriptProcessor.connect(this.audioContext.destination);

            this.socketService.emit('speech_start');

            let silenceStart = Date.now();
            const silenceThreshold = 0.02; // RMS threshold
            const maxSilenceDuration = 1500; // 1.5 seconds

            scriptProcessor.onaudioprocess = (event) => {
                if (!this.isListening) return;

                const inputData = event.inputBuffer.getChannelData(0);

                // Downsample to 16kHz and convert to Int16
                const downsampled = this.downsampleBuffer(inputData, this.audioContext!.sampleRate, 16000);
                this.socketService.emit('speech_data', downsampled);

                // VAD (Silence Detection)
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);

                if (rms > silenceThreshold) {
                    silenceStart = Date.now();
                } else {
                    if (Date.now() - silenceStart > maxSilenceDuration) {
                        this.ngZone.run(() => this.stopRecording());
                    }
                }
            };

            this.isListening = true;
            this.cd.detectChanges();

        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }

    stopRecording() {
        if (this.isListening) {
            this.isListening = false;
            this.socketService.emit('speech_stop');

            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }

            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            this.cd.detectChanges();

            // Check auto-send
            if (this.autoSendAudio && this._text.trim()) {
                this.sendMessage();
            } else {
                setTimeout(() => {
                    if (this.inputField) this.inputField.nativeElement.focus();
                });
            }
        }
    }

    // Unused but kept if needed for reference, though new logic is integrated
    initVAD(stream: MediaStream) { }
    processAudio() { }

    downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number): Int16Array {
        if (outSampleRate === sampleRate) {
            return this.floatTo16BitPCM(buffer);
        }
        if (outSampleRate > sampleRate) {
            return this.floatTo16BitPCM(buffer);
        }
        const sampleRateRatio = sampleRate / outSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Int16Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0, count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 0x7FFF;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    floatTo16BitPCM(input: Float32Array) {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
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
