import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../settings.service';

@Component({
    selector: 'app-hardware-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, MatSlideToggleModule, MatButtonModule],
    templateUrl: './hardware-settings.component.html',
    styleUrls: ['./hardware-settings.component.css']
})
export class HardwareSettingsComponent implements OnInit {
    scaleDebugLogging = false;
    loading = true;

    private settingKey = 'scale_debug_logging';

    constructor(
        private settingsService: SettingsService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.settingsService.getSettings().subscribe({
            next: (res) => {
                const settings = res.data;
                if (settings[this.settingKey]) {
                    this.scaleDebugLogging = settings[this.settingKey] === 'true';
                }
                this.loading = false;
            },
            error: () => {
                this.loading = false;
            }
        });
    }

    save(): void {
        const settings: Record<string, string> = {};
        settings[this.settingKey] = String(this.scaleDebugLogging);

        this.settingsService.updateSettings(settings).subscribe({
            next: () => {
                this.snackBar.open('Hardware settings saved', 'Close', { duration: 3000 });
            },
            error: () => {
                this.snackBar.open('Failed to save hardware settings', 'Close', { duration: 3000 });
            }
        });
    }
}
