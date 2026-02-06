import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PlaywrightService, PlaywrightStatus, PlaywrightConfig, McpResponse } from '../services/playwright.service';
import { EnvironmentService } from '../services/environment.service';

@Component({
    selector: 'app-browser-viewer',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './browser-viewer.component.html',
    styleUrls: ['./browser-viewer.component.css']
})
export class BrowserViewerComponent implements OnInit, OnDestroy {
    @ViewChild('vncFrame') vncFrame!: ElementRef<HTMLIFrameElement>;

    status: PlaywrightStatus | null = null;
    config: PlaywrightConfig | null = null;
    vncUrl: SafeResourceUrl | null = null;

    // UI state
    loading = true;
    error: string | null = null;
    activeTab: 'viewer' | 'controls' | 'console' = 'viewer';

    // Navigation
    urlInput = '';
    consoleMessages: string[] = [];

    // Page snapshot
    snapshot: any = null;

    // Screen size
    screenWidth = 1920;
    screenHeight = 1080;

    private statusInterval: any;

    constructor(
        private playwrightService: PlaywrightService,
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
        private env: EnvironmentService
    ) { }

    ngOnInit(): void {
        this.loadInitialData();
        // Poll status every 10 seconds
        this.statusInterval = setInterval(() => this.refreshStatus(), 10000);
    }

    ngOnDestroy(): void {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
    }

    private async loadInitialData(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            // Load config first
            this.playwrightService.getConfig().subscribe({
                next: (config) => {
                    this.config = config;
                    // Build the noVNC URL with autoconnect
                    // For dev, we connect directly; for prod, we'd proxy through the API
                    const vncHost = this.getVncHost();
                    const vncPort = config.vnc.port;
                    const noVncUrl = `http://${vncHost}:${vncPort}/vnc.html?autoconnect=true&resize=scale&reconnect=true`;
                    this.vncUrl = this.sanitizer.bypassSecurityTrustResourceUrl(noVncUrl);
                    this.loading = false;
                    this.cdr.detectChanges();
                },
                error: (err) => {
                    this.error = 'Failed to load config: ' + (err.message || 'Unknown error');
                    this.loading = false;
                }
            });

            // Also load status
            this.refreshStatus();
        } catch (err: any) {
            this.error = 'Failed to initialize: ' + (err.message || 'Unknown error');
            this.loading = false;
        }
    }

    private getVncHost(): string {
        // In development, connect directly to localhost
        // In production, you'd want to proxy through the API or use the Docker network
        const apiBaseUrl = this.env.apiUrl;
        const url = new URL(apiBaseUrl);
        return url.hostname;
    }

    refreshStatus(): void {
        this.playwrightService.getStatus().subscribe({
            next: (status) => {
                this.status = status;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Failed to get status:', err);
            }
        });
    }

    // Navigation controls
    navigate(): void {
        if (!this.urlInput) return;

        let url = this.urlInput;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        this.playwrightService.navigate(url).subscribe({
            next: (response) => {
                if (!response.success) {
                    this.error = response.error || 'Navigation failed';
                }
            },
            error: (err) => {
                this.error = 'Navigation error: ' + (err.message || 'Unknown error');
            }
        });
    }

    goBack(): void {
        this.playwrightService.goBack().subscribe({
            error: (err) => console.error('Go back failed:', err)
        });
    }

    goForward(): void {
        this.playwrightService.goForward().subscribe({
            error: (err) => console.error('Go forward failed:', err)
        });
    }

    refresh(): void {
        // Navigate to the same URL to refresh
        this.playwrightService.executeTool('browser_reload', {}).subscribe({
            error: (err) => console.error('Refresh failed:', err)
        });
    }

    // Page snapshot
    takeSnapshot(): void {
        this.playwrightService.snapshot().subscribe({
            next: (response) => {
                this.snapshot = response.result;
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.error = 'Snapshot failed: ' + (err.message || 'Unknown error');
            }
        });
    }

    // Screenshot
    takeScreenshot(): void {
        this.playwrightService.screenshot({ raw: true }).subscribe({
            next: (response) => {
                if (response.success && response.result) {
                    // Handle base64 screenshot
                    console.log('Screenshot taken');
                }
            },
            error: (err) => {
                this.error = 'Screenshot failed: ' + (err.message || 'Unknown error');
            }
        });
    }

    // Console messages
    loadConsoleMessages(): void {
        this.playwrightService.getConsoleMessages().subscribe({
            next: (response) => {
                if (response.success && response.result) {
                    this.consoleMessages = Array.isArray(response.result)
                        ? response.result.map(m => JSON.stringify(m))
                        : [JSON.stringify(response.result)];
                }
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Failed to load console messages:', err);
            }
        });
    }

    // Resize
    resizeBrowser(): void {
        this.playwrightService.resize(this.screenWidth, this.screenHeight).subscribe({
            error: (err) => {
                this.error = 'Resize failed: ' + (err.message || 'Unknown error');
            }
        });
    }

    // Close browser
    closeBrowser(): void {
        if (confirm('Are you sure you want to close the browser?')) {
            this.playwrightService.closeBrowser().subscribe({
                next: () => {
                    this.snapshot = null;
                },
                error: (err) => {
                    this.error = 'Close failed: ' + (err.message || 'Unknown error');
                }
            });
        }
    }

    // Tab switching
    setActiveTab(tab: 'viewer' | 'controls' | 'console'): void {
        this.activeTab = tab;
        if (tab === 'console') {
            this.loadConsoleMessages();
        }
    }

    // Error handling
    clearError(): void {
        this.error = null;
    }

    // Reload VNC frame
    reloadVnc(): void {
        if (this.vncFrame?.nativeElement) {
            const iframe = this.vncFrame.nativeElement;
            iframe.src = iframe.src;
        }
    }

    getStatusClass(): string {
        if (!this.status) return 'status-unknown';
        if (this.status.status === 'running' && this.status.mcp.connected) {
            return 'status-connected';
        }
        if (this.status.status === 'running') {
            return 'status-partial';
        }
        return 'status-error';
    }

    getStatusText(): string {
        if (!this.status) return 'Unknown';
        if (this.status.status === 'running' && this.status.mcp.connected) {
            return 'Connected';
        }
        if (this.status.status === 'running') {
            return 'Partial (MCP not connected)';
        }
        return 'Error: ' + (this.status.mcp.error || 'Connection failed');
    }
}
