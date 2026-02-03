import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GeminiService } from '../../../services/gemini.service';

@Component({
    selector: 'app-gemini-debug-log',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="log-container">
      <h2>Gemini Debug Logs (Session {{sessionId}})</h2>
      <div *ngIf="loading">Loading...</div>
      <div *ngIf="!loading && logs.length === 0">No debug logs found for this session.</div>
      
      <div *ngFor="let log of logs" class="log-entry">
        <div class="header">
            <span>Request Time: {{ log.requestTimestamp | date:'medium' }}</span>
            <span class="status" [class.error]="log.statusCode !== 200">Status: {{ log.statusCode }}</span>
            <span class="duration">Duration: {{ log.durationMs }}ms</span>
        </div>
        
        <div class="section">
            <h3>Request Data</h3>
            <pre class="request">{{ log.requestData }}</pre>
        </div>
        
        <div class="section">
            <h3>Response Data (Raw)</h3>
            <pre class="response">{{ log.responseData }}</pre>
        </div>
        
        <div class="section" *ngIf="log.toolCalls && log.toolCalls !== '[]'">
            <h3>Tool Calls</h3>
            <pre class="tool-calls">{{ log.toolCalls }}</pre>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .log-container { padding: 20px; font-family: monospace; white-space: pre-wrap; }
    .log-entry { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .header { font-weight: bold; margin-bottom: 10px; background: #f5f5f5; padding: 8px; border-radius: 4px; display: flex; gap: 20px; }
    .header .status { margin-left: auto; }
    .header .status.error { color: red; }
    .section { margin-top: 15px; }
    .section h3 { font-size: 1.1em; margin-bottom: 5px; color: #444; border-bottom: 1px solid #eee; }
    pre { background: #f9f9f9; padding: 10px; overflow-x: auto; border: 1px solid #eee; max-height: 400px; }
    .request { color: #000088; }
    .response { color: #006600; }
    .tool-calls { color: #880088; }
  `]
})
export class GeminiDebugLogComponent implements OnInit {
    logs: any[] = [];
    sessionId: number | null = null;
    loading = true;

    constructor(
        private route: ActivatedRoute,
        private geminiService: GeminiService
    ) { }

    ngOnInit() {
        this.route.params.subscribe(params => {
            if (params['sessionId']) {
                this.sessionId = +params['sessionId'];
                this.loadLogs();
            }
        });
    }

    loadLogs() {
        if (!this.sessionId) return;
        this.loading = true;
        this.geminiService.getDebugLogs(this.sessionId).subscribe({
            next: (res) => {
                this.logs = res.data;
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.loading = false;
            }
        });
    }
}
