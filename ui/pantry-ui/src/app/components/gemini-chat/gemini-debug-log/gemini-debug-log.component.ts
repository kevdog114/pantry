import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GeminiService } from '../../../services/gemini.service';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-gemini-debug-log',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatCardModule,
        MatIconModule,
        MatButtonModule,
        MatExpansionModule,
        MatProgressSpinnerModule,
        MatTooltipModule
    ],
    template: `
    <div class="log-page-container">
      <div class="page-header">
        <button mat-icon-button routerLink="/gemini-chat" matTooltip="Back to Chat">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h1>Gemini Debug Logs</h1>
        <div class="session-badge" *ngIf="sessionId">Session #{{sessionId}}</div>
      </div>

      <div *ngIf="loading" class="loading-state">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Fetching debug logs...</p>
      </div>

      <div *ngIf="!loading && logs.length === 0" class="empty-state">
        <mat-icon>history_toggle_off</mat-icon>
        <p>No debug logs found for this session.</p>
      </div>
      
      <div class="log-list" *ngIf="!loading && logs.length > 0">
        <mat-card *ngFor="let log of logs" class="log-card" [class.error-log]="log.statusCode !== 200">
          <mat-card-header>
            <div mat-card-avatar class="status-avatar" [class.success]="log.statusCode === 200" [class.error]="log.statusCode !== 200">
              <mat-icon>{{ log.statusCode === 200 ? 'check_circle' : 'error' }}</mat-icon>
            </div>
            <mat-card-title>
              {{ log.requestTimestamp | date:'medium' }}
            </mat-card-title>
            <mat-card-subtitle>
              Status: {{ log.statusCode }} • Duration: {{ log.durationMs }}ms
            </mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <mat-accordion multi>
              <!-- Request Data -->
              <mat-expansion-panel class="data-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>upload</mat-icon> Request Data
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <div class="code-container">
                  <pre class="request-code">{{ formatJson(log.requestData) }}</pre>
                </div>
              </mat-expansion-panel>

              <!-- Response Data -->
              <mat-expansion-panel class="data-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>download</mat-icon> Response Data (Raw)
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <div class="code-container">
                  <pre class="response-code">{{ formatJson(log.responseData) }}</pre>
                </div>
              </mat-expansion-panel>

              <!-- Tool Calls -->
              <mat-expansion-panel class="data-panel" *ngIf="log.toolCalls && log.toolCalls !== '[]'">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-icon>build</mat-icon> Tool Calls
                  </mat-panel-title>
                </mat-expansion-panel-header>
                <div class="code-container">
                  <pre class="tool-code">{{ formatJson(log.toolCalls) }}</pre>
                </div>
              </mat-expansion-panel>
            </mat-accordion>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
    styles: [`
    .log-page-container {
      padding: 24px;
      max-width: 1000px;
      margin: 0 auto;
      background-color: var(--mat-sys-background);
      min-height: 100vh;
      color: var(--mat-sys-on-background);
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 32px;
      
      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
      }

      .session-badge {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 500;
        margin-left: auto;
      }
    }

    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      color: var(--mat-sys-on-surface-variant);
      
      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }
    }

    .log-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .log-card {
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      background-color: var(--mat-sys-surface-container);
      box-shadow: none !important;
      overflow: hidden;

      &.error-log {
        border-color: var(--mat-sys-error-container);
      }

      mat-card-header {
        padding: 16px;
        background-color: var(--mat-sys-surface-container-high);
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }

    .status-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      
      &.success {
        color: var(--mat-sys-primary);
      }
      
      &.error {
        color: var(--mat-sys-error);
      }
    }

    .data-panel {
      box-shadow: none !important;
      border: none !important;
      background: transparent !important;

      mat-expansion-panel-header {
        font-family: 'Roboto Mono', monospace;
        font-size: 14px;
        
        mat-panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--mat-sys-on-surface);
          
          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }
        }
      }
    }

    .code-container {
      background: var(--mat-sys-surface-container-low);
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      overflow-x: auto;
    }

    pre {
      margin: 0;
      font-family: 'Roboto Mono', 'Fira Code', monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .request-code { color: var(--mat-sys-primary); }
    .response-code { color: var(--mat-sys-tertiary); }
    .tool-code { color: #d81b60; } /* Pinkish for tools, maybe define custom var later */

    /* Ensure legibility in dark mode */
    @media (prefers-color-scheme: dark) {
      .tool-code { color: #f06292; }
    }
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

    formatJson(data: string | null): string {
        if (!data) return '';
        try {
            // If it's already a string representation of an object, try to parse and re-stringify
            const parsed = JSON.parse(data);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            // If parsing fails, it might be a weird string or already formatted
            return data;
        }
    }
}
