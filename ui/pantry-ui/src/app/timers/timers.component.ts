
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

interface Timer {
    id: number;
    name: string | null;
    duration: number; // seconds
    startedAt: string;
    remainingSeconds: number;
    totalSeconds: number;
}

@Component({
    selector: 'app-timers',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatInputModule,
        MatFormFieldModule,
        FormsModule,
        MatSnackBarModule,
        MatTooltipModule
    ],
    templateUrl: './timers.component.html',
    styles: [`
        .animate-fade-in {
            animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `]
})
export class TimersComponent implements OnInit, OnDestroy {
    activeTimers: Timer[] = [];
    isCreateMode: boolean = false;

    customDuration: number | null = null;
    customName: string = '';

    private pollInterval: any;
    private localInterval: any;

    constructor(
        private http: HttpClient,
        private env: EnvironmentService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.fetchTimers();
        this.pollInterval = setInterval(() => this.fetchTimers(), 5000); // Sync less frequently on desktop
        this.localInterval = setInterval(() => {
            this.activeTimers.forEach(t => {
                if (t.remainingSeconds > 0) t.remainingSeconds--;
            });
        }, 1000);
    }

    ngOnDestroy(): void {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.localInterval) clearInterval(this.localInterval);
    }

    toggleCreateMode() {
        this.isCreateMode = !this.isCreateMode;
    }

    startTimer(minutes: number, name?: string) {
        this.createTimer(minutes * 60, name || `${minutes}m Timer`);
    }

    startCustom() {
        if (!this.customDuration || this.customDuration <= 0) return;
        this.createTimer(this.customDuration * 60, this.customName || `${this.customDuration}m Timer`);
        this.customDuration = null;
        this.customName = '';
        this.isCreateMode = false;
    }

    createTimer(durationSeconds: number, name: string) {
        this.http.post(`${this.env.apiUrl}/timers`, {
            name: name,
            duration: durationSeconds
        }).subscribe({
            next: () => {
                this.snackBar.open("Timer Started", "Close", { duration: 2000 });
                this.fetchTimers();
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open("Failed to start timer", "Close", { duration: 2000 });
            }
        });
    }

    deleteTimer(id: number) {
        this.http.delete(`${this.env.apiUrl}/timers/${id}`).subscribe({
            next: () => {
                this.snackBar.open("Timer Stopped", "Close", { duration: 2000 });
                this.fetchTimers();
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open("Failed to stop timer", "Close", { duration: 2000 });
            }
        });
    }

    fetchTimers() {
        this.http.get<any>(`${this.env.apiUrl}/timers`).subscribe({
            next: (response) => {
                const timers = response.data || [];
                const now = Date.now();

                this.activeTimers = timers.map((t: any) => {
                    const start = new Date(t.startedAt).getTime();
                    const end = start + (t.duration * 1000);
                    const remaining = Math.max(0, Math.floor((end - now) / 1000));
                    return {
                        id: t.id,
                        name: t.name,
                        duration: t.duration,
                        startedAt: t.startedAt,
                        totalSeconds: t.duration,
                        remainingSeconds: remaining
                    };
                }).filter((t: any) => t.remainingSeconds > 0);
            },
            error: (e) => console.error("Error fetching timers", e)
        });
    }

    formatTimer(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}
