import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterModule } from '@angular/router';

export interface MealPlanEditDialogData {
    planId: number;
    title: string;
    recipeId?: number;
    productId?: number;
    isLeftover?: boolean;
    currentMealType?: string;
    currentDate: string; // ISO string
    mealTypes: string[];
    visibleDays: Date[];
    servingsConsumed?: number;
    recipeYield?: string;
    quantity?: number;
    isProduct: boolean;
}

export interface MealPlanEditDialogResult {
    action: 'save' | 'delete' | 'cancel';
    mealType?: string;
    date?: Date;
    servingsConsumed?: number;
    quantity?: number;
}

@Component({
    selector: 'app-meal-plan-edit-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatFormFieldModule,
        MatInputModule,
        RouterModule,
    ],
    template: `
        <div class="edit-dialog">
            <div class="dialog-header">
                <div class="title-row">
                    <span class="item-title">{{ data.title }}</span>
                    <span *ngIf="data.isLeftover" class="leftover-badge">Leftover</span>
                </div>
                <a *ngIf="data.recipeId"
                   [routerLink]="['/recipes', data.recipeId]"
                   class="view-link"
                   (click)="dialogRef.close({ action: 'cancel' })">
                    <mat-icon>open_in_new</mat-icon> View Recipe
                </a>
                <a *ngIf="data.productId && !data.recipeId"
                   class="view-link view-link-disabled">
                    <mat-icon>inventory_2</mat-icon> Product
                </a>
            </div>

            <div class="dialog-section" *ngIf="showServingsConsumed">
                <label class="section-label">Servings Consumed</label>
                <div class="servings-input-row">
                    <button mat-icon-button class="stepper-btn" (click)="decrementServings()" [disabled]="servingsConsumed <= 0">
                        <mat-icon>remove</mat-icon>
                    </button>
                    <input type="number" class="servings-input" [(ngModel)]="servingsConsumed" min="0" max="99" />
                    <button mat-icon-button class="stepper-btn" (click)="incrementServings()">
                        <mat-icon>add</mat-icon>
                    </button>
                    <span class="yield-hint" *ngIf="data.recipeYield">of {{ data.recipeYield }}</span>
                </div>
            </div>

            <div class="dialog-section" *ngIf="showQuantity">
                <label class="section-label">Quantity</label>
                <div class="servings-input-row">
                    <button mat-icon-button class="stepper-btn" (click)="decrementQuantity()" [disabled]="quantity <= 1">
                        <mat-icon>remove</mat-icon>
                    </button>
                    <input type="number" class="servings-input" [(ngModel)]="quantity" min="1" max="99" />
                    <button mat-icon-button class="stepper-btn" (click)="incrementQuantity()">
                        <mat-icon>add</mat-icon>
                    </button>
                </div>
            </div>

            <div class="dialog-section">
                <label class="section-label">Meal</label>
                <div class="chip-group">
                    <button *ngFor="let type of data.mealTypes"
                            class="chip"
                            [class.chip-selected]="selectedMealType === type"
                            (click)="selectMealType(type)">
                        <mat-icon class="chip-icon">{{ getMealIcon(type) }}</mat-icon>
                        {{ type }}
                    </button>
                </div>
            </div>

            <div class="dialog-section">
                <label class="section-label">Day</label>
                <div class="chip-group">
                    <button *ngFor="let day of data.visibleDays"
                            class="chip chip-day"
                            [class.chip-selected]="isSameDay(selectedDate, day)"
                            (click)="selectDay(day)">
                        <span class="day-abbr">{{ getDayAbbr(day) }}</span>
                        <span class="day-num">{{ day | date:'d' }}</span>
                    </button>
                </div>
            </div>

            <div class="dialog-actions">
                <button mat-button color="warn" (click)="onDelete()">
                    <mat-icon>delete_outline</mat-icon> Remove
                </button>
                <div class="action-right">
                    <button mat-button (click)="onCancel()">Cancel</button>
                    <button mat-flat-button color="primary" (click)="onSave()" [disabled]="!hasChanges()">
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .edit-dialog {
            padding: 8px 4px;
            min-width: 340px;
            max-width: 440px;
        }

        .dialog-header {
            margin-bottom: 20px;
        }

        .title-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .item-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--mat-sys-on-surface);
            line-height: 1.3;
        }

        .leftover-badge {
            background: var(--mat-sys-secondary-container);
            color: var(--mat-sys-on-secondary-container);
            font-size: 0.7rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .view-link {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.875rem;
            color: var(--mat-sys-primary);
            text-decoration: none;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .view-link:hover {
            opacity: 0.8;
            text-decoration: underline;
        }

        .view-link-disabled {
            color: var(--mat-sys-on-surface-variant);
            cursor: default;
        }

        .view-link mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
        }

        .dialog-section {
            margin-bottom: 20px;
        }

        .section-label {
            display: block;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--mat-sys-on-surface-variant);
            margin-bottom: 8px;
        }

        .servings-input-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .stepper-btn {
            background: var(--mat-sys-surface-container-high);
            border-radius: 50%;
            width: 36px;
            height: 36px;
        }

        .servings-input {
            width: 64px;
            text-align: center;
            font-size: 1.25rem;
            font-weight: 600;
            border: 1px solid var(--mat-sys-outline-variant);
            border-radius: 8px;
            padding: 6px 8px;
            background: var(--mat-sys-surface);
            color: var(--mat-sys-on-surface);
            outline: none;
            transition: border-color 0.2s;
            -moz-appearance: textfield;
        }

        .servings-input::-webkit-outer-spin-button,
        .servings-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        .servings-input:focus {
            border-color: var(--mat-sys-primary);
        }

        .yield-hint {
            font-size: 0.85rem;
            color: var(--mat-sys-on-surface-variant);
            font-style: italic;
        }

        .chip-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 8px 14px;
            border-radius: 20px;
            border: 1.5px solid var(--mat-sys-outline-variant);
            background: var(--mat-sys-surface);
            color: var(--mat-sys-on-surface);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            outline: none;
        }

        .chip:hover {
            border-color: var(--mat-sys-primary);
            background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
        }

        .chip-selected {
            background: var(--mat-sys-primary) !important;
            color: var(--mat-sys-on-primary) !important;
            border-color: var(--mat-sys-primary) !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .chip-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
        }

        .chip-day {
            flex-direction: column;
            padding: 8px 12px;
            min-width: 48px;
            text-align: center;
            gap: 2px;
        }

        .day-abbr {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .day-num {
            font-size: 1.1rem;
            font-weight: 700;
        }

        .dialog-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--mat-sys-outline-variant);
        }

        .action-right {
            display: flex;
            gap: 8px;
            align-items: center;
        }
    `]
})
export class MealPlanEditDialogComponent {
    selectedMealType?: string;
    selectedDate: Date;
    servingsConsumed: number;
    quantity: number;
    showServingsConsumed: boolean;
    showQuantity: boolean;

    // Store originals for change detection
    private originalMealType?: string;
    private originalDate: Date;
    private originalServingsConsumed: number;
    private originalQuantity: number;

    constructor(
        public dialogRef: MatDialogRef<MealPlanEditDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MealPlanEditDialogData
    ) {
        this.selectedMealType = data.currentMealType;
        this.selectedDate = new Date(data.currentDate);
        this.servingsConsumed = data.servingsConsumed || 0;
        this.quantity = data.quantity || 1;

        // Show servings consumed only for recipes (non-leftovers) that have a yield
        this.showServingsConsumed = !!data.recipeId && !data.isLeftover && !!data.recipeYield;
        // Show quantity for products and leftovers
        this.showQuantity = data.isProduct || !!data.isLeftover;

        // Store originals
        this.originalMealType = data.currentMealType;
        this.originalDate = new Date(data.currentDate);
        this.originalServingsConsumed = data.servingsConsumed || 0;
        this.originalQuantity = data.quantity || 1;
    }

    selectMealType(type: string) {
        this.selectedMealType = this.selectedMealType === type ? undefined : type;
    }

    selectDay(day: Date) {
        this.selectedDate = day;
    }

    isSameDay(a: Date, b: Date): boolean {
        return a.toDateString() === b.toDateString();
    }

    getDayAbbr(day: Date): string {
        return day.toLocaleDateString('en-US', { weekday: 'short' });
    }

    getMealIcon(type: string): string {
        switch (type) {
            case 'Breakfast': return 'free_breakfast';
            case 'Lunch': return 'lunch_dining';
            case 'Dinner': return 'dinner_dining';
            case 'Snack': return 'cookie';
            default: return 'restaurant';
        }
    }

    incrementServings() {
        this.servingsConsumed++;
    }

    decrementServings() {
        if (this.servingsConsumed > 0) this.servingsConsumed--;
    }

    incrementQuantity() {
        this.quantity++;
    }

    decrementQuantity() {
        if (this.quantity > 1) this.quantity--;
    }

    hasChanges(): boolean {
        return this.selectedMealType !== this.originalMealType
            || !this.isSameDay(this.selectedDate, this.originalDate)
            || this.servingsConsumed !== this.originalServingsConsumed
            || this.quantity !== this.originalQuantity;
    }

    onSave() {
        const result: MealPlanEditDialogResult = {
            action: 'save',
            mealType: this.selectedMealType,
            date: this.selectedDate,
            servingsConsumed: this.servingsConsumed,
            quantity: this.quantity,
        };
        this.dialogRef.close(result);
    }

    onDelete() {
        this.dialogRef.close({ action: 'delete' });
    }

    onCancel() {
        this.dialogRef.close({ action: 'cancel' });
    }
}
