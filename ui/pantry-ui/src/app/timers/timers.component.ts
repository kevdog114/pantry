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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

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
        MatTooltipModule,
        MatProgressSpinnerModule
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
        .pulse-urgent {
            animation: pulse-red 2s infinite;
        }
        @keyframes pulse-red {
            0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
            100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        :host ::ng-deep .timer-card.mat-mdc-card {
            width: 340px !important;
            flex: 0 0 340px;
            display: flex;
            flex-direction: column;
        }
    `]
})
export class TimersComponent implements OnInit, OnDestroy {
    activeTimers: any[] = [];
    isCreateMode: boolean = false;

    customDuration: number | null = null;
    customName: string = '';

    private pollInterval: any;
    private localInterval: any;
    private completedNotified = new Set<number>();

    constructor(
        private http: HttpClient,
        private env: EnvironmentService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.fetchTimers();
        this.pollInterval = setInterval(() => this.fetchTimers(), 5000);
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

    extendTimer(id: number, seconds: number) {
        this.http.patch(`${this.env.apiUrl}/timers/${id}/extend`, { seconds }).subscribe({
            next: () => {
                this.snackBar.open(`Added ${seconds / 60}m`, "Close", { duration: 2000 });
                this.fetchTimers();
            },
            error: (err) => console.error(err)
        });
    }

    restartTimer(id: number) {
        this.http.patch(`${this.env.apiUrl}/timers/${id}/restart`, {}).subscribe({
            next: () => {
                this.snackBar.open("Timer Restarted", "Close", { duration: 2000 });
                this.fetchTimers();
            },
            error: (err) => console.error(err)
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

                    const timer = {
                        id: t.id,
                        name: t.name,
                        duration: t.duration,
                        startedAt: t.startedAt,
                        totalSeconds: t.duration,
                        remainingSeconds: remaining,
                        isCompleted: remaining === 0
                    };

                    if (timer.isCompleted && !this.completedNotified.has(timer.id)) {
                        this.onTimerComplete(timer);
                    } else if (!timer.isCompleted && this.completedNotified.has(timer.id)) {
                        this.completedNotified.delete(timer.id);
                    }

                    return timer;
                });
            },
            error: (e) => console.error("Error fetching timers", e)
        });
    }

    formatTimer(seconds: number): string {
        if (seconds <= 0) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    onTimerComplete(timer: any) {
        this.completedNotified.add(timer.id);
        this.playSound();
        if ('vibrate' in navigator) {
            navigator.vibrate([500, 200, 500]);
        }
    }

    playSound() {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log("Audio play blocked", e));
    }
}
