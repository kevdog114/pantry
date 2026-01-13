
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../environments/environment';

interface WeatherSettings {
    provider: string;
    lat: string;
    lon: string;
}

interface DailyWeather {
    date: string | Date;
    highTemp: number;
    lowTemp: number;
    condition: string;
    precipitationChance: number;
    provider: string;
    updatedAt: string;
}

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
    selector: 'app-weather-settings',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatCardModule,
        MatTableModule,
        MatIconModule,
        MatSnackBarModule
    ],
    templateUrl: './weather-settings.component.html',
    styleUrls: ['./weather-settings.component.css']
})
export class WeatherSettingsComponent implements OnInit {
    settings: WeatherSettings = { provider: 'disabled', lat: '', lon: '' };
    forecast: DailyWeather[] = [];
    displayedColumns: string[] = ['date', 'high', 'low', 'condition', 'precip', 'updated'];
    isLoading = false;
    isLocating = false;

    constructor(private http: HttpClient, private snackBar: MatSnackBar) { }

    ngOnInit() {
        this.loadSettings();
        this.loadForecast();
    }

    getBrowserLocation() {
        if (!navigator.geolocation) {
            this.snackBar.open('Geolocation is not supported by your browser', 'Close', { duration: 3000 });
            return;
        }

        this.isLocating = true;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.settings.lat = position.coords.latitude.toFixed(4);
                this.settings.lon = position.coords.longitude.toFixed(4);
                this.isLocating = false;
                this.snackBar.open('Location updated', undefined, { duration: 2000 });
            },
            (error) => {
                console.error('Error getting location', error);
                this.isLocating = false;
                let message = 'Failed to get location';
                if (error.code === error.PERMISSION_DENIED) {
                    message = 'Location permission denied';
                }
                this.snackBar.open(message, 'Close', { duration: 3000 });
            }
        );
    }

    loadSettings() {
        this.http.get<WeatherSettings>(`${environment.apiUrl}/weather/settings`)
            .subscribe(res => {
                this.settings = res;
                if (!this.settings.provider) this.settings.provider = 'disabled';
            });
    }

    loadForecast() {
        // Get next 14 days just to be sure we see something
        const start = new Date().toISOString().split('T')[0];
        const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        this.http.get<DailyWeather[]>(`${environment.apiUrl}/weather/forecast?start=${start}&end=${end}`)
            .subscribe(res => {
                this.forecast = res.map(w => {
                    // Fix timezone offset issue
                    // The API returns JSON, so date is definitely a string initially
                    let dateStr = w.date as unknown as string;
                    if (dateStr && dateStr.includes('T')) {
                        dateStr = dateStr.split('T')[0];
                    }
                    const [y, m, d] = dateStr.split('-').map(Number);
                    // Create local date object
                    const localDate = new Date(y, m - 1, d);
                    return {
                        ...w,
                        date: localDate
                    };
                });
            });
    }

    saveSettings() {
        this.isLoading = true;
        this.http.post(`${environment.apiUrl}/weather/settings`, this.settings)
            .subscribe({
                next: () => {
                    this.isLoading = false;
                    // Refresh forecast after a delay
                    setTimeout(() => this.loadForecast(), 2000);
                },
                error: (err) => {
                    console.error(err);
                    this.isLoading = false;
                }
            });
    }
}
