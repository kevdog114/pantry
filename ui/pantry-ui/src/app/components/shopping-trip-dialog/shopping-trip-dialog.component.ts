import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

export interface ShoppingTripDialogData {
  notes: string;
}

@Component({
  selector: 'app-shopping-trip-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule
  ],
  template: `
        <h2 mat-dialog-title>Shopping Trip</h2>
        <mat-dialog-content>
            <mat-form-field appearance="fill" style="width: 100%">
                <mat-label>Notes (Store, Items, etc.)</mat-label>
                <textarea matInput [(ngModel)]="data.notes" rows="5"></textarea>
            </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button (click)="onNoClick()">Cancel</button>
            <button mat-raised-button color="primary" [mat-dialog-close]="data.notes">Save</button>
        </mat-dialog-actions>
    `
})
export class ShoppingTripDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<ShoppingTripDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ShoppingTripDialogData
  ) { }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
