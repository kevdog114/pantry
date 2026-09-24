import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SocketService } from './socket.service';

/**
 * Microphone capture for the speech pipeline.
 *
 * Streams 16 kHz mono PCM to the server over the socket (`speech_start` /
 * `speech_data` / `speech_stop`) and surfaces the transcripts that come back
 * on `speech_text`. Stops on its own after a short silence, so a caller only
 * has to start it.
 *
 * Extracted so the kiosk voice panel and the chat composer capture audio the
 * same way. (SmartChatInputComponent still has its own copy of this logic; it
 * predates the service and is working, so migrating it is a separate change.)
 */
@Injectable({ providedIn: 'root' })
export class VoiceCaptureService {
    /** RMS below this counts as silence. */
    private static readonly SILENCE_RMS = 0.02;
    /**
     * Backstop only. The server runs Silero VAD with --vad-endpointing and
     * finalises the utterance itself, which is both faster (measured 2.55s vs
     * 3.45s from end-of-speech to transcript) and better at telling a
     * mid-sentence breath from an actual stop than this RMS check. This timer
     * exists for the case where endpointing is disabled or never fires, so it
     * is deliberately longer than the server's window.
     */
    private static readonly SILENCE_MS = 3000;
    private static readonly TARGET_RATE = 16000;

    /**
     * How long to wait after capture stops for the transcript to come back.
     * The server only sends audio-stop to Whisper when we stop, and Whisper
     * then decodes the whole utterance — measured at 0.6-3.4s depending on
     * model. Anything shorter silently discards the result.
     */
    private static readonly TRANSCRIPT_TIMEOUT_MS = 12000;

    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private microphone: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private analyser: AnalyserNode | null = null;
    private levelFrame: number | null = null;
    private socketBound = false;
    /** True between stop() and the transcript arriving (or timing out). */
    private awaitingTranscript = false;
    private transcriptTimer: any = null;

    private readonly _listening = new BehaviorSubject<boolean>(false);
    private readonly _transcript = new BehaviorSubject<string>('');
    /** Input level 0-100 while capturing, for a live meter. */
    private readonly _level = new BehaviorSubject<number>(0);
    /** True while waiting for the server to return a transcript. */
    private readonly _transcribing = new BehaviorSubject<boolean>(false);
    /** Emits the transcript once capture has stopped. */
    private readonly _final = new Subject<string>();
    /** Emits when the microphone could not be opened. */
    private readonly _error = new Subject<string>();

    readonly listening$: Observable<boolean> = this._listening.asObservable();
    readonly transcript$: Observable<string> = this._transcript.asObservable();
    readonly level$: Observable<number> = this._level.asObservable();
    readonly transcribing$: Observable<boolean> = this._transcribing.asObservable();
    readonly final$: Observable<string> = this._final.asObservable();
    readonly error$: Observable<string> = this._error.asObservable();

    get isListening(): boolean { return this._listening.value; }
    get transcript(): string { return this._transcript.value; }

    constructor(private socketService: SocketService, private ngZone: NgZone) { }

    private bindSocket(): void {
        if (this.socketBound) return;
        this.socketBound = true;
        this.socketService.on('speech_text', (data: any) => {
            const text = (data?.text ?? '').trim();
            // Accept while capturing AND while waiting after stop: the server
            // only asks Whisper to decode once we stop, so the real transcript
            // always arrives after listening has ended.
            if (!this._listening.value && !this.awaitingTranscript) return;
            this.ngZone.run(() => {
                this._transcript.next(text);
                if (this.awaitingTranscript && text) {
                    this.settle(text);
                } else if (this._listening.value && text) {
                    // Server-side endpointing decided the utterance is over and
                    // sent the transcript without being asked. That is the end
                    // of the turn: close the microphone and use it, rather than
                    // sitting on the backstop timer for another second.
                    this.stop(text);
                }
            });
        });
    }

    /** Open the microphone and begin streaming. Resolves once capture is live. */
    async start(): Promise<void> {
        if (this._listening.value) return;
        this.bindSocket();
        this._transcript.next('');

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err: any) {
            this._error.next(err?.message || 'Microphone unavailable');
            return;
        }

        this.audioContext = new AudioContext();
        this.microphone = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.microphone.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        // Level meter, matching the Utilities mic test so both read the same.
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.3;
        this.microphone.connect(this.analyser);
        this.pumpLevel();

        this.socketService.emit('speech_start');
        this._listening.next(true);

        let silenceStart = Date.now();
        this.processor.onaudioprocess = (event) => {
            if (!this._listening.value) return;
            const input = event.inputBuffer.getChannelData(0);

            this.socketService.emit(
                'speech_data',
                this.downsample(input, this.audioContext!.sampleRate, VoiceCaptureService.TARGET_RATE)
            );

            let sum = 0;
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
            const rms = Math.sqrt(sum / input.length);

            if (rms > VoiceCaptureService.SILENCE_RMS) {
                silenceStart = Date.now();
            } else if (Date.now() - silenceStart > VoiceCaptureService.SILENCE_MS) {
                // Back into Angular's zone: this fires from an audio callback.
                this.ngZone.run(() => this.stop());
            }
        };
    }

    /**
     * Stop capture and finish the turn. Safe to call twice.
     *
     * @param finalText when the server has already endpointed and given us the
     *   transcript, settle on it straight away instead of waiting again.
     */
    stop(finalText?: string): void {
        if (!this._listening.value) return;
        this._listening.next(false);
        this.socketService.emit('speech_stop');

        if (this.levelFrame !== null) { cancelAnimationFrame(this.levelFrame); this.levelFrame = null; }
        this._level.next(0);
        if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); this.processor = null; }
        if (this.microphone) { this.microphone.disconnect(); this.microphone = null; }
        if (this.analyser) { this.analyser.disconnect(); this.analyser = null; }
        if (this.audioContext) { this.audioContext.close().catch(() => undefined); this.audioContext = null; }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }

        this.awaitingTranscript = true;

        // Endpointing already produced the transcript — nothing left to wait for.
        if (finalText) {
            this.settle(finalText.trim());
            return;
        }

        // Otherwise the decode is still in flight (the server only asks Whisper
        // to decode once we stop). Wait for it rather than guessing a delay.
        this._transcribing.next(true);
        clearTimeout(this.transcriptTimer);
        this.transcriptTimer = setTimeout(
            () => this.settle(this._transcript.value.trim()),
            VoiceCaptureService.TRANSCRIPT_TIMEOUT_MS
        );
    }

    /** Finish one capture cycle exactly once, whether by transcript or timeout. */
    private settle(text: string): void {
        if (!this.awaitingTranscript) return;
        this.awaitingTranscript = false;
        clearTimeout(this.transcriptTimer);
        this.transcriptTimer = null;
        this._transcribing.next(false);
        this._final.next(text);
    }

    /** Clear the transcript without touching capture. */
    reset(): void {
        this._transcript.next('');
    }

    /**
     * Drive the input-level meter. Runs outside Angular (one frame per ~16ms
     * would otherwise trigger change detection continuously) and only pushes
     * back in when the value actually moves.
     */
    private pumpLevel(): void {
        this.ngZone.runOutsideAngular(() => {
            const tick = () => {
                if (!this.analyser) return;
                const bins = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteFrequencyData(bins);
                let sum = 0;
                for (let i = 0; i < bins.length; i++) sum += bins[i];
                // Same mapping as the Utilities mic test: 0-50 average -> 0-100%,
                // with a noise gate so a quiet room reads as silent.
                let val = ((sum / bins.length) / 50) * 100;
                if (val < 5) val = 0;
                val = Math.min(Math.round(val), 100);
                if (val !== this._level.value) {
                    this.ngZone.run(() => this._level.next(val));
                }
                this.levelFrame = requestAnimationFrame(tick);
            };
            this.levelFrame = requestAnimationFrame(tick);
        });
    }

    private downsample(buffer: Float32Array, rate: number, outRate: number): Int16Array {
        if (outRate >= rate) return this.floatTo16BitPCM(buffer);
        const ratio = rate / outRate;
        const result = new Int16Array(Math.round(buffer.length / ratio));
        let offsetResult = 0;
        let offsetBuffer = 0;
        while (offsetResult < result.length) {
            const next = Math.round((offsetResult + 1) * ratio);
            let accum = 0, count = 0;
            for (let i = offsetBuffer; i < next && i < buffer.length; i++) { accum += buffer[i]; count++; }
            result[offsetResult] = Math.max(-1, Math.min(1, count > 0 ? accum / count : 0)) * 0x7FFF;
            offsetResult++;
            offsetBuffer = next;
        }
        return result;
    }

    private floatTo16BitPCM(input: Float32Array): Int16Array {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }
}
