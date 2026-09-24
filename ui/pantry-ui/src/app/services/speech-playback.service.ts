import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EnvironmentService } from './environment.service';

/**
 * Speaks a reply through the kiosk's speakers.
 *
 * Fetches synthesised audio from the API (which proxies Kokoro on the Mac
 * Studio) and plays it. Kept separate from VoiceCaptureService: capture and
 * playback have nothing in common beyond both involving audio, and the kiosk
 * needs to stop one when the other starts.
 */
@Injectable({ providedIn: 'root' })
export class SpeechPlaybackService {
    /**
     * Whether replies are spoken. Remembered per device — the kiosk in the
     * kitchen wants speech, a phone looking at the same page usually does not.
     */
    private static readonly PREF_KEY = 'pantry.speakReplies';

    private audio: HTMLAudioElement | null = null;
    private objectUrl: string | null = null;

    private readonly _speaking = new BehaviorSubject<boolean>(false);
    private readonly _enabled = new BehaviorSubject<boolean>(this.readPref());

    readonly speaking$: Observable<boolean> = this._speaking.asObservable();
    readonly enabled$: Observable<boolean> = this._enabled.asObservable();

    constructor(private env: EnvironmentService) { }

    get enabled(): boolean { return this._enabled.value; }

    setEnabled(on: boolean): void {
        if (!on) this.stop();
        this._enabled.next(on);
        try {
            localStorage.setItem(SpeechPlaybackService.PREF_KEY, on ? '1' : '0');
        } catch {
            // Private windows and blocked site data throw here. The preference
            // just will not persist; speaking still works for this session.
        }
    }

    toggle(): boolean {
        this.setEnabled(!this._enabled.value);
        return this._enabled.value;
    }

    /**
     * Speak `text`. Resolves when playback finishes, or immediately if speech
     * is switched off or the text is empty.
     *
     * Never rejects: failing to speak an answer that is already on screen is
     * not worth surfacing as an error, so problems are logged and swallowed.
     * Call this from a user gesture (the push-to-talk press) — browsers block
     * autoplay otherwise.
     */
    async speak(text: string): Promise<void> {
        const trimmed = (text || '').trim();
        if (!this._enabled.value || !trimmed) return;

        this.stop();
        try {
            const res = await fetch(`${this.env.apiUrl}/tts/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: trimmed }),
            });
            if (!res.ok) {
                console.warn(`[TTS] HTTP ${res.status}; leaving the reply on screen only`);
                return;
            }

            const blob = await res.blob();
            this.objectUrl = URL.createObjectURL(blob);
            const audio = new Audio(this.objectUrl);
            this.audio = audio;
            this._speaking.next(true);

            await new Promise<void>((resolve) => {
                const done = () => { this.cleanup(); resolve(); };
                audio.onended = done;
                audio.onerror = () => {
                    console.warn('[TTS] playback failed');
                    done();
                };
                audio.play().catch(err => {
                    // Typically the autoplay policy: reached without a gesture.
                    console.warn('[TTS] play() blocked:', err?.message || err);
                    done();
                });
            });
        } catch (err: any) {
            console.warn('[TTS] request failed:', err?.message || err);
            this.cleanup();
        }
    }

    /** Cut playback short — used when a new turn starts. */
    stop(): void {
        if (this.audio) {
            this.audio.pause();
            this.audio.onended = null;
            this.audio.onerror = null;
        }
        this.cleanup();
    }

    private cleanup(): void {
        this.audio = null;
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
        if (this._speaking.value) this._speaking.next(false);
    }

    private readPref(): boolean {
        try {
            // Default on: this exists for the kiosk, where speech is the point.
            return localStorage.getItem(SpeechPlaybackService.PREF_KEY) !== '0';
        } catch {
            return true;
        }
    }
}
