import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-device-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatSlideToggleModule
  ],
  template: `
    <h2 mat-dialog-title>Configure {{ data.device.name }}</h2>
    <mat-dialog-content>
      <form [formGroup]="configForm" class="flex flex-col gap-6 pt-4">
        
        <div class="flex items-center justify-between">
            <div class="flex flex-col">
                <span class="font-medium text-gray-700 dark:text-gray-200">Auto Cut</span>
                <span class="text-xs text-gray-400">Cut label after printing</span>
            </div>
            <mat-slide-toggle formControlName="autoCut" color="primary"></mat-slide-toggle>
        </div>

        <div class="flex items-center justify-between">
            <div class="flex flex-col">
                 <span class="font-medium text-gray-700 dark:text-gray-200">High Quality</span>
                 <span class="text-xs text-gray-400">Enable dithering for better images</span>
            </div>
            <mat-slide-toggle formControlName="highQuality" color="primary"></mat-slide-toggle>
        </div>

      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="configForm.invalid">Save</button>
    </mat-dialog-actions>
  `
})
export class DeviceConfigDialogComponent {
  configForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<DeviceConfigDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { device: any, config: any }
  ) {
    this.configForm = this.fb.group({
      autoCut: [this.data.config.autoCut !== undefined ? this.data.config.autoCut : true],
      highQuality: [this.data.config.highQuality !== undefined ? this.data.config.highQuality : true]
    });
  }

  save() {
    if (this.configForm.valid) {
      this.dialogRef.close(this.configForm.value);
    }
  }
}
