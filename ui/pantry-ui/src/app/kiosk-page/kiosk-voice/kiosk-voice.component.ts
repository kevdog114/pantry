import { Component, EventEmitter, OnDestroy, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MarkdownModule } from 'ngx-markdown';
import { Subscription } from 'rxjs';
import { VoiceCaptureService } from '../../services/voice-capture.service';
import { GeminiService, StreamEvent } from '../../services/gemini.service';

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'answer' | 'error';

/**
 * Voice-first panel for the kiosk.
 *
 * Deliberately not a chat transcript: on a wall display the useful things are
 * one big target, what it heard, and the answer. History lives in Smart Chat.
 *
 * The cycle is press -> speak -> silence stops capture -> answer, so the only
 * interaction is the initial press.
 */
@Component({
    selector: 'app-kiosk-voice',
    standalone: true,
    imports: [CommonModule, MatIconModule, MarkdownModule],
    templateUrl: './kiosk-voice.component.html',
    styleUrls: ['./kiosk-voice.component.css']
})
export class KioskVoiceComponent implements OnInit, OnDestroy {
    /** So the kiosk status bar can report what is really happening. */
    @Output() stateChange = new EventEmitter<VoiceState>();

    private _state: VoiceState = 'idle';
    get state(): VoiceState { return this._state; }
    set state(value: VoiceState) {
        if (this._state === value) return;
        this._state = value;
        this.stateChange.emit(value);
    }
    transcript = '';
    /** Live input level 0-100, so a dead or muted microphone is visible. */
    level = 0;
    answer = '';
    errorText = '';
    /** Tool names as they run, so the wait is explained rather than blank. */
    activity: string[] = [];

    private sessionId?: number;
    private subs: Subscription[] = [];
    private streamSub?: Subscription;

    constructor(
        private voice: VoiceCaptureService,
        private gemini: GeminiService,
        private cd: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.subs.push(
            this.voice.transcript$.subscribe(t => { this.transcript = t; this.cd.detectChanges(); }),
            this.voice.level$.subscribe(v => { this.level = v; this.cd.detectChanges(); }),
            this.voice.transcribing$.subscribe(on => {
                // Capture has stopped but Whisper is still decoding; say so
                // rather than appearing to have ignored the user.
                if (on && this.state === 'listening') { this.state = 'transcribing'; this.cd.detectChanges(); }
            }),
            this.voice.final$.subscribe(text => this.onSpeechFinished(text)),
            this.voice.error$.subscribe(msg => {
                this.state = 'error';
                this.errorText = msg.includes('denied') || msg.includes('NotAllowed')
                    ? 'The microphone is blocked for this page.'
                    : `Microphone unavailable: ${msg}`;
                this.cd.detectChanges();
            })
        );
    }

    ngOnDestroy(): void {
        this.voice.stop();
        this.streamSub?.unsubscribe();
        this.subs.forEach(s => s.unsubscribe());
    }

    get isListening(): boolean { return this.state === 'listening'; }
    get isBusy(): boolean { return this.state === 'listening' || this.state === 'thinking'; }

    /** The one control: start listening, or stop early if already listening. */
    async toggle(): Promise<void> {
        if (this.state === 'listening') { this.voice.stop(); return; }
        if (this.state === 'thinking') return;

        this.transcript = '';
        this.answer = '';
        this.errorText = '';
        this.activity = [];
        this.state = 'listening';
        this.cd.detectChanges();
        await this.voice.start();
    }

    private onSpeechFinished(text: string): void {
        if (this.state !== 'listening' && this.state !== 'transcribing') return;

        if (!text) {
            // Nothing came back. Say so — silently returning to idle is
            // indistinguishable from the button not having worked.
            this.state = 'error';
            this.errorText = 'I did not catch that. Tap the microphone and try again.';
            this.cd.detectChanges();
            return;
        }

        this.transcript = text;
        this.state = 'thinking';
        this.cd.detectChanges();
        this.ask(text);
    }

    private ask(prompt: string): void {
        this.streamSub?.unsubscribe();
        this.streamSub = this.gemini.sendMessageStream(prompt, this.sessionId).subscribe({
            next: (event: StreamEvent) => {
                if (event.type === 'session' && event.sessionId) {
                    this.sessionId = event.sessionId;
                } else if (event.type === 'tool_call' && event.toolCall) {
                    const label = (event.toolCall.name || '').replace(/^audio_/, '').replace(/_/g, ' ');
                    if (label) { this.activity = [...this.activity, label]; this.cd.detectChanges(); }
                } else if (event.type === 'done') {
                    // Chunks carry the raw JSON envelope, so wait for the parsed
                    // payload rather than streaming braces onto a kitchen wall.
                    this.answer = this.extractText(event.data) || 'Done.';
                    this.state = 'answer';
                    this.cd.detectChanges();
                } else if (event.type === 'error') {
                    this.fail(event.message || 'Something went wrong');
                }
            },
            error: (err) => this.fail(err?.message || 'Connection failed'),
            complete: () => {
                if (this.state === 'thinking') { this.state = 'answer'; this.answer ||= 'Done.'; this.cd.detectChanges(); }
            }
        });
    }

    private fail(message: string): void {
        this.state = 'error';
        this.errorText = message;
        this.cd.detectChanges();
    }

    /** Pull the readable reply out of the response envelope. */
    private extractText(data: any): string {
        const items = data?.items;
        if (!Array.isArray(items)) return typeof data === 'string' ? data : '';
        return items
            .filter((i: any) => i?.type === 'chat')
            .map((i: any) => i.content ?? i.text ?? '')
            .filter(Boolean)
            .join('\n\n');
    }
}
