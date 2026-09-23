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
    /** Silence needed before capture stops itself. */
    private static readonly SILENCE_MS = 1500;
    private static readonly TARGET_RATE = 16000;

    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private microphone: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private socketBound = false;

    private readonly _listening = new BehaviorSubject<boolean>(false);
    private readonly _transcript = new BehaviorSubject<string>('');
    /** Emits the transcript once capture has stopped. */
    private readonly _final = new Subject<string>();
    /** Emits when the microphone could not be opened. */
    private readonly _error = new Subject<string>();

    readonly listening$: Observable<boolean> = this._listening.asObservable();
    readonly transcript$: Observable<string> = this._transcript.asObservable();
    readonly final$: Observable<string> = this._final.asObservable();
    readonly error$: Observable<string> = this._error.asObservable();

    get isListening(): boolean { return this._listening.value; }
    get transcript(): string { return this._transcript.value; }

    constructor(private socketService: SocketService, private ngZone: NgZone) { }

    private bindSocket(): void {
        if (this.socketBound) return;
        this.socketBound = true;
        this.socketService.on('speech_text', (data: any) => {
            if (!this._listening.value && !this._transcript.value) return;
            this.ngZone.run(() => this._transcript.next(data?.text ?? ''));
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

    /** Stop capture and emit the final transcript. Safe to call twice. */
    stop(): void {
        if (!this._listening.value) return;
        this._listening.next(false);
        this.socketService.emit('speech_stop');

        if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); this.processor = null; }
        if (this.microphone) { this.microphone.disconnect(); this.microphone = null; }
        if (this.audioContext) { this.audioContext.close().catch(() => undefined); this.audioContext = null; }
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }

        // The last speech_text can land just after stop; give it a moment so a
        // trailing word is not dropped from the final transcript.
        setTimeout(() => this._final.next(this._transcript.value.trim()), 350);
    }

    /** Clear the transcript without touching capture. */
    reset(): void {
        this._transcript.next('');
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
