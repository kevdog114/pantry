import { Component, Inject, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { GeminiService } from '../../services/gemini.service';
import { Product } from '../../types/product';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SmartChatInputComponent } from '../smart-chat-input/smart-chat-input.component';
import { FormsModule } from '@angular/forms';
import { ChatInterfaceComponent, ChatMessage, ChatContentItem } from '../chat-interface/chat-interface.component';

import { Recipe } from '../../types/recipe';

@Component({
    selector: 'app-audio-chat-dialog',
    templateUrl: './audio-chat-dialog.component.html',
    styleUrls: ['./audio-chat-dialog.component.scss'],
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatCheckboxModule, SmartChatInputComponent, FormsModule, ChatInterfaceComponent]
})
export class AudioChatDialogComponent implements OnDestroy {
    isThinking = false;
    isSpeaking = false;
    transcript = '';
    messages: ChatMessage[] = [];
    sessionId?: number;

    autoPlayAudio = false;

    constructor(
        public dialogRef: MatDialogRef<AudioChatDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { product?: Product, recipe?: Recipe },
        private geminiService: GeminiService,
        private cd: ChangeDetectorRef,
        private ngZone: NgZone
    ) { }

    ngOnDestroy() {
        window.speechSynthesis.cancel();
    }

    handleSend(event: { text: string, image?: File }) {
        this.messages.push({
            sender: 'You',
            contents: [{ type: 'chat', text: event.text }]
        });

        if (event.image) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.messages[this.messages.length - 1].contents.unshift({
                    type: 'image',
                    imageUrl: e.target.result
                });
            };
            reader.readAsDataURL(event.image);
        }

        this.sendToGemini(event.text, event.image);
    }

    sendToGemini(text: string, image?: File) {
        this.isThinking = true;
        // this.responseItems = []; // Removed

        let entityType: string | undefined;
        let entityId: number | undefined;

        let context = '';
        if (this.data.product) {
            entityType = 'product';
            entityId = this.data.product.id;
            context = `User is viewing product: ${this.data.product.title}. 
    ID: ${this.data.product.id}. 
    Current Stock Count: ${this.data.product.stockItems?.length || 0}. 
    Barcodes: ${this.data.product.barcodes?.map(b => b.barcode).join(', ')}.`;
        } else if (this.data.recipe) {
            entityType = 'recipe';
            entityId = this.data.recipe.id;
            context = `User is viewing recipe: ${this.data.recipe.title}.
    ID: ${this.data.recipe.id}.
    Description: ${this.data.recipe.description || 'None'}.
    Ingredients: ${this.data.recipe.ingredientText || 'None'}.
    Steps: ${this.data.recipe.steps?.map((s, i) => `${i + 1}. ${s.description}`).join('\n') || 'None'}.`;
        }

        this.geminiService.sendMessage(text, [], this.sessionId, image, context, entityType, entityId).subscribe({
            next: (res) => {
                this.isThinking = false;
                if (res.sessionId) {
                    this.sessionId = res.sessionId;
                }

                const data = res.data;
                const geminiContents: ChatContentItem[] = [];
                let spokenText = '';

                // Logic borrowed from GeminiChatComponent to parse structure
                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach((item: any) => {
                        if (item.type === 'recipe' && item.recipe) {
                            geminiContents.push({
                                type: 'recipe',
                                recipe: item.recipe,
                                expanded: false
                            });
                        } else {
                            geminiContents.push({
                                type: 'chat',
                                text: item.content || JSON.stringify(item)
                            });
                            spokenText += (item.content || '') + ' ';
                        }
                    });
                } else {
                    // Fallback
                    const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');
                    if (isRecipe && data.recipe) {
                        geminiContents.push({
                            type: 'recipe',
                            recipe: data.recipe,
                            expanded: false
                        });
                        spokenText = "I found a recipe for " + data.recipe.title;
                    } else {
                        let content = data.content;
                        if (typeof content === 'object') content = JSON.stringify(content, null, 2);
                        else if (!content) content = JSON.stringify(data, null, 2);

                        geminiContents.push({ type: 'chat', text: content });
                        spokenText = content;
                    }
                }

                this.messages.push({
                    sender: 'Gemini',
                    contents: geminiContents
                });

                this.cd.detectChanges();

                if (this.autoPlayAudio && spokenText) {
                    this.speak(spokenText);
                }
            },
            error: (err) => {
                this.isThinking = false;
                this.messages.push({
                    sender: 'Gemini',
                    contents: [{ type: 'chat', text: "Error communicating with Gemini." }]
                });
                console.error(err);
                this.cd.detectChanges();
            }
        });
    }

    speak(text: string) {
        if ('speechSynthesis' in window) {
            this.isSpeaking = true;
            this.cd.detectChanges();

            // Strip markdown * and # characters for cleaner speech
            const speechText = text.replace(/[*#]/g, '');
            const utterance = new SpeechSynthesisUtterance(speechText);

            // Try to select a better voice
            const voices = window.speechSynthesis.getVoices();
            // Look for Google voices first, then Microsoft/Apple natural voices
            const preferredVoice = voices.find(v => v.name.includes("Google US English")) ||
                voices.find(v => v.name.includes("Google")) ||
                voices.find(v => v.name.includes("Natural"));

            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            utterance.onend = () => {
                this.ngZone.run(() => {
                    this.isSpeaking = false;
                    this.cd.detectChanges();
                });
            };
            window.speechSynthesis.speak(utterance);
        }
    }

    stopSpeaking() {
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
        this.cd.detectChanges();
    }
}
