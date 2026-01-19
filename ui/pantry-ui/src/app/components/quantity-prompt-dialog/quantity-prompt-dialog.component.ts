import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface QuantityPromptData {
    title: string;
    message: string;
    max: number;
    current: number;
}

@Component({
    selector: 'app-quantity-prompt-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        FormsModule
    ],
    template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <mat-form-field appearance="outline" class="w-100">
        <mat-label>Quantity</mat-label>
        <input matInput type="number" [(ngModel)]="quantity" min="1" [max]="data.max" (keyup.enter)="confirm()">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" (click)="confirm()" [disabled]="!isValid()">Confirm</button>
    </mat-dialog-actions>
  `,
    styles: [`
    .w-100 { width: 100%; }
  `]
})
export class QuantityPromptDialogComponent {
    public quantity: number;

    constructor(
        public dialogRef: MatDialogRef<QuantityPromptDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: QuantityPromptData
    ) {
        this.quantity = data.current;
    }

    isValid(): boolean {
        return this.quantity > 0 && this.quantity <= this.data.max;
    }

    confirm(): void {
        if (this.isValid()) {
            this.dialogRef.close(this.quantity);
        }
    }

    cancel(): void {
        this.dialogRef.close();
    }
}
