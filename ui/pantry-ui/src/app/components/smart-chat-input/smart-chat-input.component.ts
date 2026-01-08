
import { Component, EventEmitter, Input, Output, OnDestroy, ChangeDetectorRef, NgZone, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

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
    selectedImage: File | null = null;
    selectedImagePreview: string | ArrayBuffer | null = null;
    recognition: any;

    constructor(private cd: ChangeDetectorRef, private ngZone: NgZone) {
        this.initSpeechRecognition();
    }

    ngOnDestroy() {
        if (this.recognition) {
            this.recognition.abort();
        }
    }

    initSpeechRecognition() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'en-US';
            this.recognition.onresult = (event: any) => {
                this.ngZone.run(() => {
                    const text = event.results[0][0].transcript;
                    this._text = text;
                    this.isListening = false;
                    this.cd.detectChanges();

                    if (this.autoSendAudio && text.trim()) {
                        this.sendMessage();
                    } else {
                        // Only focus back if we didn't just auto-send, otherwise we might lose focus on new elements
                        setTimeout(() => {
                            if (this.inputField) this.inputField.nativeElement.focus();
                        });
                    }
                });
            };
            this.recognition.onend = () => {
                this.ngZone.run(() => {
                    this.isListening = false;
                    this.cd.detectChanges();
                });
            };
            // ...
            this.recognition.onerror = (event: any) => {
                this.ngZone.run(() => {
                    console.error("Speech recognition error", event);
                    this.isListening = false;
                    this.cd.detectChanges();
                });
            };
        }
    }

    toggleListening() {
        if (this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        } else {
            if (this.recognition) {
                this.isListening = true;
                this.recognition.start();
            }
        }
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
            this.text = ''; // Clear input but keep image? No usually clear both
            this.clearImage();
        }
    }

    triggerImageUpload() {
        this.fileInput.nativeElement.click();
    }
}
