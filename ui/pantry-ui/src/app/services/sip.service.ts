
import { Injectable } from '@angular/core';
import { SocketService } from './socket.service';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SipCallState {
    state: string;
    code?: number;
    duration?: number;
}

export interface SipIncomingCall {
    remote_uri: string;
    remote_contact: string;
}

export interface SipConfigResponse {
    config: SipConfig;
}

export interface SipConfig {
    enabled: boolean;
    domain?: string;
    username?: string;
    password?: string;
    extensions?: Array<{ name: string, number: string }>;
}

@Injectable({
    providedIn: 'root'
})
export class SipService {

    private _callState = new BehaviorSubject<SipCallState | null>(null);
    public callState$ = this._callState.asObservable();

    private _incomingCall = new BehaviorSubject<SipIncomingCall | null>(null);
    public incomingCall$ = this._incomingCall.asObservable();

    private _regState = new BehaviorSubject<any>(null);
    public regState$ = this._regState.asObservable();

    private _config = new BehaviorSubject<SipConfig | null>(null);
    public config$ = this._config.asObservable();

    constructor(private socketService: SocketService) {
        this.socketService.fromEvent<SipCallState>('sip_call_state').subscribe((state: SipCallState) => {
            console.log('SIP Call State:', state);
            this._callState.next(state);
            if (state.state === 'DISCONNECTED') {
                this._incomingCall.next(null);
                setTimeout(() => this._callState.next(null), 3000);
            }
        });

        this.socketService.fromEvent<SipIncomingCall>('sip_incoming_call').subscribe((call: SipIncomingCall) => {
            console.log('SIP Incoming Call:', call);
            this._incomingCall.next(call);
        });

        this.socketService.fromEvent<any>('sip_reg_state').subscribe((state: any) => {
            console.log('SIP Registration State:', state);
            this._regState.next(state);
        });

        this.socketService.fromEvent<SipConfigResponse>('sip_config').subscribe((res: SipConfigResponse) => {
            console.log('SIP Config Received:', res);
            this._config.next(res.config);
        });
    }

    getConfig(kioskId: number) {
        this.socketService.emit('sip_get_config', { kioskId });
    }

    configure(kioskId: number, config: SipConfig) {
        this.socketService.emit('sip_configure', { kioskId, config });
    }

    dial(kioskId: number, uri: string) {
        this.socketService.emit('sip_dial', { kioskId, uri });
    }

    hangup(kioskId: number) {
        this.socketService.emit('sip_hangup', { kioskId });
    }

    answer(kioskId: number) {
        this.socketService.emit('sip_answer', { kioskId });
    }
}
