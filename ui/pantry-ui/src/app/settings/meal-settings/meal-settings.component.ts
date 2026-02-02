import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SettingsService } from '../settings.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-meal-settings',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatListModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        DragDropModule
    ],
    templateUrl: './meal-settings.component.html',
    styleUrls: ['./meal-settings.component.css']
})
export class MealSettingsComponent implements OnInit {
    mealTypes: string[] = [];
    newMealType: string = '';
    loading = false;

    private key = 'meal_types';
    private defaultTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

    constructor(
        private settingsService: SettingsService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.loadSettings();
    }

    loadSettings() {
        this.loading = true;
        this.settingsService.getSettings().subscribe({
            next: (res) => {
                const settings = res.data;
                if (settings[this.key]) {
                    try {
                        this.mealTypes = JSON.parse(settings[this.key]);
                    } catch (e) {
                        console.error('Error parsing meal types', e);
                        this.mealTypes = [...this.defaultTypes];
                    }
                } else {
                    this.mealTypes = [...this.defaultTypes];
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading settings', err);
                this.mealTypes = [...this.defaultTypes];
                this.loading = false;
            }
        });
    }

    saveSettings() {
        this.loading = true;
        const settings: Record<string, string> = {};
        settings[this.key] = JSON.stringify(this.mealTypes);

        this.settingsService.updateSettings(settings).subscribe({
            next: () => {
                this.snackBar.open('Meal settings saved', 'Close', { duration: 3000 });
                this.loading = false;
            },
            error: (err) => {
                console.error('Error saving settings', err);
                this.snackBar.open('Failed to save meal settings', 'Close', { duration: 3000 });
                this.loading = false;
            }
        });
    }

    drop(event: CdkDragDrop<string[]>) {
        moveItemInArray(this.mealTypes, event.previousIndex, event.currentIndex);
    }

    addType() {
        if (this.newMealType.trim()) {
            this.mealTypes.push(this.newMealType.trim());
            this.newMealType = '';
        }
    }

    removeType(index: number) {
        this.mealTypes.splice(index, 1);
    }
}
