
import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatCardModule } from '@angular/material/card';
import { GeminiService } from '../../services/gemini.service';

@Component({
    selector: 'app-quick-snack',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatChipsModule, MatIconModule, MatProgressBarModule, MatCardModule],
    templateUrl: './quick-snack.component.html',
    styleUrls: ['./quick-snack.component.css']
})
export class QuickSnackComponent {

    effortChips = ['Grab & Go', 'Quick Prep (<5m)', 'Mini Meal'];
    vibeChips = ['Healthy', 'Sweet', 'Salty', 'Protein'];

    selectedEffort: string[] = [];
    selectedVibe: string[] = [];

    suggestions: any[] = [];
    currentIndex = 0;
    loading = false;
    hasSuggestions = false;

    constructor(
        private bottomSheetRef: MatBottomSheetRef<QuickSnackComponent>,
        private geminiService: GeminiService,
        private cdr: ChangeDetectorRef
    ) { }

    toggleEffort(chip: string) {
        if (this.selectedEffort.includes(chip)) {
            this.selectedEffort = this.selectedEffort.filter(c => c !== chip);
        } else {
            this.selectedEffort.push(chip);
        }
    }

    toggleVibe(chip: string) {
        if (this.selectedVibe.includes(chip)) {
            this.selectedVibe = this.selectedVibe.filter(c => c !== chip);
        } else {
            this.selectedVibe.push(chip);
        }
    }

    isEffortSelected(chip: string): boolean {
        return this.selectedEffort.includes(chip);
    }
    isVibeSelected(chip: string): boolean {
        return this.selectedVibe.includes(chip);
    }

    suggestSnack() {
        this.loading = true;
        const tags = [...this.selectedEffort, ...this.selectedVibe];

        this.geminiService.quickSuggest(tags).subscribe({
            next: (res) => {
                if (res.data && res.data.length > 0) {
                    this.suggestions = res.data;
                    this.currentIndex = 0;
                    this.hasSuggestions = true;
                } else {
                    // Handle no suggestions case gracefully?
                }
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error fetching suggestions', err);
                this.loading = false;
            }
        });
    }

    spinAgain() {
        if (this.suggestions.length > 1) {
            this.currentIndex = (this.currentIndex + 1) % this.suggestions.length;
        }
    }

    getCurrentSuggestion() {
        if (this.suggestions.length === 0) return null;
        return this.suggestions[this.currentIndex];
    }

    close() {
        this.bottomSheetRef.dismiss();
    }
}
