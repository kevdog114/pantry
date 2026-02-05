
import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SmartChatInputComponent } from '../smart-chat-input/smart-chat-input.component';
import { RecipeCardComponent, ChatRecipe } from '../recipe-card/recipe-card.component';
import { MarkdownModule } from 'ngx-markdown';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ChatContentItem {
    type: 'chat' | 'recipe' | 'image' | 'tool_call';
    text?: string;
    recipe?: ChatRecipe;
    expanded?: boolean;
    imageUrl?: string;
    toolCall?: {
        name: string;
        args?: any;
        displayName?: string;
    };
    durationMs?: number; // Duration of tool call in milliseconds
}

export interface ChatMessage {
    sender: string;
    contents: ChatContentItem[];
    timestamp?: Date;
    meta?: {
        usingCache?: boolean;
        modelName?: string;
        usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
            cachedContentTokenCount?: number;
        };
    };
}

@Component({
    selector: 'app-chat-interface',
    templateUrl: './chat-interface.component.html',
    styleUrls: ['./chat-interface.component.scss'],
    standalone: true,
    imports: [CommonModule, SmartChatInputComponent, RecipeCardComponent, MarkdownModule, MatButtonModule, MatIconModule]
})
export class ChatInterfaceComponent implements AfterViewChecked, OnInit, OnChanges {
    @Input() messages: ChatMessage[] = [];
    @Input() isLoading: boolean = false;
    @Input() loadingText: string = 'Thinking...';
    @Input() placeholder: string = 'Type a message...';
    @Input() enableAudio: boolean = true;
    @Input() autoSendAudio: boolean = false;
    @Input() showWelcomeMessage: boolean = false;

    @Output() send = new EventEmitter<{ text: string, image?: File }>();
    @Output() textToSpeech = new EventEmitter<string>();

    @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

    // Track previous message count to auto-scroll only on new messages
    private prevMessageCount = 0;

    isSpeaking = false;

    constructor() { }

    ngOnInit() {
        this.scrollToBottom();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['messages']) {
            // Reset the counter when the messages array reference changes (new chat loaded)
            this.prevMessageCount = 0;
            // We rely on ngAfterViewChecked to do the actual scrolling once the view updates
        }
    }

    ngAfterViewChecked() {
        if (this.messages.length > this.prevMessageCount) {
            this.prevMessageCount = this.messages.length;
            this.scrollToBottom();
        }
    }

    handleSend(event: { text: string, image?: File }) {
        this.send.emit(event);
    }

    scrollToBottom(): void {
        try {
            if (this.scrollContainer) {
                this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
            }
        } catch (err) { }
    }

    onSpeak(text: string) {
        this.textToSpeech.emit(text);
    }
}
