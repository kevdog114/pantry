import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeminiService } from '../services/gemini.service';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  models: any[] = [];

  // Settings keys
  chatModelKey = 'gemini_chat_model';
  visionModelKey = 'gemini_vision_model';
  expirationModelKey = 'gemini_expiration_model';

  selectedChatModel: string = 'gemini-flash-latest';
  selectedVisionModel: string = 'gemini-flash-latest';
  selectedExpirationModel: string = 'gemini-flash-latest';

  loading = true;

  constructor(
    private geminiService: GeminiService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
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

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Settings saved successfully', 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Error saving settings', err);
        this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
      }
    });
  }
}
