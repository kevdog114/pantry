import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeminiService } from '../services/gemini.service';
import { SettingsService } from './settings.service';

import { RouterModule } from '@angular/router';

import { MatTabsModule } from '@angular/material/tabs';
import { WeatherSettingsComponent } from './weather-settings/weather-settings.component';

import { PbxSettingsComponent } from './pbx-settings/pbx-settings.component';
import { KioskCommandSettingsComponent } from './kiosk-command-settings/kiosk-command-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    RouterModule,
    MatTabsModule,
    WeatherSettingsComponent,
    MatSlideToggleModule,
    PbxSettingsComponent,
    KioskCommandSettingsComponent
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  models: any[] = [];

  // Settings keys
  chatModelKey = 'gemini_chat_model';
  visionModelKey = 'gemini_vision_model';
  expirationModelKey = 'gemini_expiration_model';
  quickSnackModelKey = 'gemini_quick_snack_model';
  imageGenModelKey = 'gemini_image_generation_model';
  debugLoggingKey = 'gemini_debug_logging';
  timezoneKey = 'system_timezone';

  selectedChatModel: string = 'gemini-flash-latest';
  selectedVisionModel: string = 'gemini-flash-latest';
  selectedExpirationModel: string = 'gemini-flash-latest';
  selectedQuickSnackModel: string = 'gemini-flash-latest';
  selectedImageGenModel: string = 'imagen-4.0-generate-001';
  debugLogging: boolean = false;
  selectedTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone; // Default to system

  availableTimezones: string[] = [];

  loading = true;
  kioskMode = false;

  constructor(
    private geminiService: GeminiService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {
    try {
      this.availableTimezones = Intl.supportedValuesOf('timeZone');
    } catch (e) {
      console.warn("Intl.supportedValuesOf not supported, using fallback");
      this.availableTimezones = [
        'UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
        'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'
      ];
    }
  }

  ngOnInit(): void {
    // Load Kiosk Mode setting from LocalStorage
    this.kioskMode = localStorage.getItem('kiosk_mode') === 'true';
    this.applyKioskMode();
    this.loadData();
  }

  loadData() {
    this.loading = true;
    // Load models and settings in parallel-ish
    this.geminiService.getAvailableModels().subscribe({
      next: (res) => {
        this.models = res.data;
        this.loadSettings();
      },
      error: (err) => {
        console.error('Error loading models', err);
        this.snackBar.open('Failed to load available models', 'Close', { duration: 3000 });
        this.loadSettings(); // Try to load settings anyway
      }
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (res) => {
        const settings = res.data;
        if (settings[this.chatModelKey]) this.selectedChatModel = settings[this.chatModelKey];
        if (settings[this.visionModelKey]) this.selectedVisionModel = settings[this.visionModelKey];
        if (settings[this.expirationModelKey]) this.selectedExpirationModel = settings[this.expirationModelKey];
        if (settings[this.quickSnackModelKey]) this.selectedQuickSnackModel = settings[this.quickSnackModelKey];
        if (settings[this.imageGenModelKey]) this.selectedImageGenModel = settings[this.imageGenModelKey];

        if (settings[this.debugLoggingKey]) {
          this.debugLogging = settings[this.debugLoggingKey] === 'true';
        }

        if (settings[this.timezoneKey]) {
          this.selectedTimezone = settings[this.timezoneKey];
        }

        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading settings', err);
        this.snackBar.open('Failed to load settings', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  saveSettings() {
    const settings: Record<string, string> = {};
    settings[this.chatModelKey] = this.selectedChatModel;
    settings[this.visionModelKey] = this.selectedVisionModel;
    settings[this.expirationModelKey] = this.selectedExpirationModel;
    settings[this.quickSnackModelKey] = this.selectedQuickSnackModel;
    settings[this.imageGenModelKey] = this.selectedImageGenModel;
    settings[this.debugLoggingKey] = String(this.debugLogging);
    settings[this.timezoneKey] = this.selectedTimezone;

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Settings saved successfully', 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Error saving settings', err);
        this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
      }
    });

    localStorage.setItem('kiosk_mode', this.kioskMode ? 'true' : 'false');
    this.applyKioskMode();
  }

  applyKioskMode() {
    if (this.kioskMode) {
      document.body.classList.add('kiosk-mode');
    } else {
      document.body.classList.remove('kiosk-mode');
    }
  }
}
