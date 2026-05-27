import { Component, Inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SmartChatInputComponent } from '../smart-chat-input/smart-chat-input.component';
import { FormsModule } from '@angular/forms';
import { ChatInterfaceComponent, ChatMessage, ChatContentItem } from '../chat-interface/chat-interface.component';
import { CommonModule } from '@angular/common';
import { GeminiService, StreamEvent } from '../../services/gemini.service';
import { Product } from '../../types/product';
import { Recipe } from '../../types/recipe';

@Component({
    selector: 'app-audio-chat-dialog',
    templateUrl: './audio-chat-dialog.component.html',
    styleUrls: ['./audio-chat-dialog.component.scss'],
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, SmartChatInputComponent, FormsModule, ChatInterfaceComponent]
})
export class AudioChatDialogComponent implements OnDestroy {
    isThinking = false;
    loadingText = 'Thinking...';
    messages: ChatMessage[] = [];
    sessionId?: number;

    constructor(
        public dialogRef: MatDialogRef<AudioChatDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { product?: Product, recipe?: Recipe },
        private geminiService: GeminiService,
        private cd: ChangeDetectorRef,
        private snackBar: MatSnackBar
    ) { }

    ngOnDestroy() { }

    handleSend(event: { text: string, image?: File }) {
        if (event.text?.trim() === '' && !event.image) {
            return;
        }

        const userContents: ChatContentItem[] = [];
        if (event.image) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.messages.push({
                    sender: 'You',
                    contents: [
                        { type: 'image', imageUrl: e.target.result },
                        { type: 'chat', text: event.text }
                    ],
                    timestamp: new Date()
                });
                this.executeSend(event.text, event.image);
            };
            reader.readAsDataURL(event.image);
        } else {
            if (event.text) {
                userContents.push({ type: 'chat', text: event.text });
            }
            this.messages.push({ sender: 'You', contents: userContents, timestamp: new Date() });
            this.executeSend(event.text, undefined);
        }
    }

    private getContext(): { additionalContext: string, entityType?: string, entityId?: number } {
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

        return { additionalContext: context, entityType, entityId };
    }

    private executeSend(prompt: string, image?: File) {
        this.isThinking = true;
        this.loadingText = 'Thinking...';
        this.cd.detectChanges();

        // If image is present, fall back to non-streaming endpoint
        if (image) {
            this.executeNonStreamingSend(prompt, image);
            return;
        }

        const { additionalContext, entityType, entityId } = this.getContext();

        // We'll create the streaming message when the first chunk arrives
        let streamingMessage: ChatMessage | null = null;
        let accumulatedText = '';
        let earlyMeta: ChatMessage['meta'] = undefined;

        this.geminiService.sendMessageStream(
            prompt,
            this.sessionId || undefined,
            additionalContext,
            entityType,
            entityId
        ).subscribe({
            next: (event: StreamEvent) => {
                if (event.type === 'session' && event.sessionId) {
                    if (this.sessionId !== event.sessionId) {
                        this.sessionId = event.sessionId;
                    }
                } else if (event.type === 'meta') {
                    earlyMeta = {
                        modelName: event.modelName,
                        usingCache: event.usingCache
                    };
                    if (streamingMessage) {
                        streamingMessage.meta = { ...streamingMessage.meta, ...earlyMeta };
                    }
                } else if (event.type === 'tool_call' && event.toolCall) {
                    if (!streamingMessage) {
                        streamingMessage = {
                            sender: 'Gemini',
                            contents: [],
                            timestamp: new Date(),
                            meta: earlyMeta
                        };
                        this.messages.push(streamingMessage);
                    }
                    streamingMessage.contents.push({
                        type: 'tool_call',
                        toolCall: event.toolCall
                    });
                    this.loadingText = (event as any).displayName || `Using tool: ${event.toolCall.name}...`;
                    this.cd.detectChanges();
                } else if (event.type === 'chunk' && event.text) {
                    accumulatedText += event.text;
                    const displayText = this.extractDisplayText(accumulatedText);
                    this.updateLoadingText(accumulatedText);

                    const hasRealContent = displayText && displayText !== '...' && displayText.trim().length > 0;

                    if (!streamingMessage && hasRealContent) {
                        streamingMessage = {
                            sender: 'Gemini',
                            contents: [{ type: 'chat', text: displayText }],
                            timestamp: new Date(),
                            meta: earlyMeta
                        };
                        this.messages.push(streamingMessage);
                    } else if (streamingMessage) {
                        const chatContent = streamingMessage.contents.find(c => c.type === 'chat');
                        if (chatContent) {
                            chatContent.text = displayText;
                        } else if (hasRealContent) {
                            streamingMessage.contents.push({ type: 'chat', text: displayText });
                        }
                    }
                    this.cd.detectChanges();
                } else if (event.type === 'done' && event.data) {
                    this.isThinking = false;
                    this.loadingText = 'Thinking...';
                    if (streamingMessage) {
                        streamingMessage.contents = this.parseGeminiResponse(event.data);
                        if (event.meta) {
                            streamingMessage.meta = { ...streamingMessage.meta, ...event.meta };
                        }
                    } else {
                        const finalMessage: ChatMessage = {
                            sender: 'Gemini',
                            contents: this.parseGeminiResponse(event.data),
                            timestamp: new Date(),
                            meta: { ...earlyMeta, ...event.meta }
                        };
                        this.messages.push(finalMessage);
                    }
                    this.cd.detectChanges();
                } else if (event.type === 'error') {
                    this.isThinking = false;
                    const errorMessage: ChatMessage = {
                        sender: 'Gemini',
                        contents: [{
                            type: 'chat',
                            text: `Error: ${event.message || 'An error occurred'}`
                        }],
                        timestamp: new Date()
                    };
                    if (streamingMessage) {
                        streamingMessage.contents = errorMessage.contents;
                    } else {
                        this.messages.push(errorMessage);
                    }
                    this.cd.detectChanges();
                    this.snackBar.open(event.message || 'Streaming error', 'Close', { duration: 5000 });
                }
            },
            error: (err) => {
                this.isThinking = false;
                this.loadingText = 'Thinking...';
                const errorMessage: ChatMessage = {
                    sender: 'Gemini',
                    contents: [{
                        type: 'chat',
                        text: `Error: ${err.message || 'Connection failed'}`
                    }],
                    timestamp: new Date()
                };
                if (streamingMessage) {
                    streamingMessage.contents = errorMessage.contents;
                } else {
                    this.messages.push(errorMessage);
                }
                this.cd.detectChanges();
                this.snackBar.open('Connection error', 'Close', { duration: 5000 });
            },
            complete: () => {
                this.isThinking = false;
                this.loadingText = 'Thinking...';
            }
        });
    }

    /**
     * Non-streaming fallback for when images are attached.
     */
    private executeNonStreamingSend(prompt: string, image: File) {
        const { additionalContext, entityType, entityId } = this.getContext();

        this.geminiService.sendMessage(prompt, [], this.sessionId || undefined, image, additionalContext, entityType, entityId).subscribe({
            next: (response) => {
                this.isThinking = false;
                this.loadingText = 'Thinking...';

                if (response.sessionId) {
                    this.sessionId = response.sessionId;
                }

                const geminiContents = this.parseGeminiResponse(response.data);

                if (geminiContents.length > 0) {
                    this.messages.push({
                        sender: 'Gemini',
                        contents: geminiContents,
                        timestamp: new Date(),
                        meta: response.meta
                    });
                }

                this.cd.detectChanges();

                if (response.warning) {
                    this.snackBar.open(response.warning, 'Close', { duration: 5000 });
                }
            },
            error: (err) => {
                this.isThinking = false;
                this.loadingText = 'Thinking...';
                this.messages.push({
                    sender: 'Gemini',
                    contents: [{ type: 'chat', text: "Error communicating with Gemini." }],
                    timestamp: new Date()
                });
                console.error(err);
                this.cd.detectChanges();
            }
        });
    }

    /**
     * Update the loading indicator text based on what's being generated.
     */
    private updateLoadingText(accumulatedText: string): void {
        const hasRecipe = accumulatedText.includes('"recipe"') ||
            accumulatedText.includes('"type": "recipe"') ||
            accumulatedText.includes('"type":"recipe"');

        if (hasRecipe) {
            const titleMatch = accumulatedText.match(/"title"\s*:\s*"([^"]*)"/);
            if (titleMatch && titleMatch[1]) {
                this.loadingText = `Creating recipe: ${titleMatch[1]}...`;
            } else {
                this.loadingText = 'Creating recipe...';
            }
        } else if (accumulatedText.length > 50) {
            this.loadingText = 'Generating response...';
        }
    }

    /**
     * Extract displayable text from the raw Gemini stream.
     */
    private extractDisplayText(rawText: string): string {
        if (!rawText || rawText.trim().length === 0) {
            return '';
        }

        let text = rawText.trim();

        if (text.startsWith('```json')) {
            text = text.substring(7);
        } else if (text.startsWith('```')) {
            text = text.substring(3);
        }
        if (text.endsWith('```')) {
            text = text.substring(0, text.length - 3);
        }
        text = text.trim();

        if (text.startsWith('{')) {
            try {
                const parsed = JSON.parse(text);
                if (parsed.items && Array.isArray(parsed.items)) {
                    const displayParts: string[] = [];
                    parsed.items.forEach((item: any) => {
                        if (item.type === 'chat' && item.content) {
                            displayParts.push(item.content);
                        } else if (item.type === 'recipe' && item.recipe) {
                            displayParts.push(`*Recipe: ${item.recipe.title || 'Loading...'}*`);
                        }
                    });
                    if (displayParts.length > 0) {
                        return displayParts.join('\n\n');
                    }
                }
                if (parsed.content) {
                    return parsed.content;
                }
                if (parsed.message) {
                    return parsed.message;
                }
                if (parsed.text) {
                    return parsed.text;
                }
            } catch (e) {
                // JSON not complete yet
            }
        }

        const displayParts: string[] = [];

        const contentMatches = text.matchAll(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
        for (const match of contentMatches) {
            if (match[1]) {
                const content = match[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                if (content.trim().length > 0) {
                    displayParts.push(content);
                }
            }
        }

        const messageMatches = text.matchAll(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
        for (const match of messageMatches) {
            if (match[1]) {
                const content = match[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                if (content.trim().length > 0) {
                    displayParts.push(content);
                }
            }
        }

        const lastContentIndex = text.lastIndexOf('"content"');
        const lastMessageIndex = text.lastIndexOf('"message"');
        const lastFieldIndex = Math.max(lastContentIndex, lastMessageIndex);
        if (lastFieldIndex !== -1) {
            const afterContent = text.substring(lastFieldIndex);
            const partialMatch = afterContent.match(/^"(?:content|message)"\s*:\s*"((?:[^"\\]|\\.)*?)$/);
            if (partialMatch && partialMatch[1]) {
                const partialContent = partialMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                if (partialContent.trim().length > 0) {
                    displayParts.push(partialContent);
                }
            }
        }

        if (displayParts.length > 0) {
            return displayParts.join('\n\n');
        }

        const hasRecipeInProgress = text.includes('"type"') &&
            (text.includes('"recipe"') || text.includes('"type": "recipe"') || text.includes('"type":"recipe"'));

        if (hasRecipeInProgress) {
            const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
            if (titleMatch && titleMatch[1]) {
                return `Creating recipe: **${titleMatch[1]}**...`;
            }
            return 'Creating recipe...';
        }

        if (text.startsWith('{')) {
            return '...';
        }

        return text || '...';
    }

    /**
     * Parse the final Gemini response into ChatContentItems.
     */
    private parseGeminiResponse(data: any): ChatContentItem[] {
        const geminiContents: ChatContentItem[] = [];

        if (data.items && Array.isArray(data.items)) {
            data.items.forEach((item: any) => {
                if (item.type === 'recipe' && item.recipe) {
                    geminiContents.push({
                        type: 'recipe',
                        recipe: item.recipe,
                        expanded: false
                    });
                } else if (item.type === 'tool_call' && item.toolCall) {
                    geminiContents.push({
                        type: 'tool_call',
                        toolCall: item.toolCall
                    });
                } else {
                    geminiContents.push({
                        type: 'chat',
                        text: item.content || JSON.stringify(item)
                    });
                }
            });
        } else {
            const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');

            if (isRecipe && data.recipe) {
                geminiContents.push({
                    type: 'recipe',
                    recipe: data.recipe,
                    expanded: false
                });
            } else {
                const textFields = ['content', 'message', 'text', 'response'];
                let content: string | null = null;

                for (const field of textFields) {
                    const val = data[field];
                    if (val !== undefined && val !== null) {
                        if (typeof val === 'string' && val.trim().length > 0) {
                            content = val;
                            break;
                        } else if (typeof val === 'object') {
                            content = JSON.stringify(val, null, 2);
                            break;
                        }
                    }
                }

                if (!content) {
                    const keys = Object.keys(data).filter(k => k !== 'type');
                    const hasOnlyEmptyValues = keys.every(k => !data[k] || (typeof data[k] === 'string' && data[k].trim() === ''));
                    if (hasOnlyEmptyValues || keys.length === 0) {
                        content = "I received your message but couldn't generate a response. Please try again.";
                    } else {
                        content = JSON.stringify(data, null, 2);
                    }
                }

                geminiContents.push({
                    type: 'chat',
                    text: content
                });
            }
        }

        return geminiContents.length > 0 ? geminiContents : [{ type: 'chat', text: '' }];
    }
}
