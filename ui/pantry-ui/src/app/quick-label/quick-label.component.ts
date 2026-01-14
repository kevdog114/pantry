import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { LabelService } from '../services/label.service';
import { KioskService } from '../services/kiosk.service';

@Component({
  selector: 'app-quick-label',
  templateUrl: './quick-label.component.html',
  styleUrls: ['./quick-label.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatSnackBarModule
  ],
})
export class QuickLabelComponent implements OnInit {
  labelTypes: string[] = ['Prepared', 'Expires', 'Best By', 'Opened'];
  selectedType: string = 'Prepared';
  selectedDate: Date = new Date();

  labelSizeCode: string = 'continuous';
  labelSizeDescription: string = 'Continuous';

  constructor(
    private labelService: LabelService,
    private kioskService: KioskService,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.detectPrinterMedia();
  }

  detectPrinterMedia() {
    this.kioskService.getKiosks().subscribe(kiosks => {
      // Find first online printer
      let found = false;
      for (const kiosk of kiosks) {
        if (kiosk.devices) {
          const printer = kiosk.devices.find(d => d.type === 'PRINTER' && (d.status === 'ONLINE' || d.status === 'READY'));
          if (printer && printer.details) {
            try {
              const details = typeof printer.details === 'string' ? JSON.parse(printer.details) : printer.details;
              // Check detected label width
              if (details.detected_label) {
                const w = details.detected_label.width;
                if (w >= 50) {
                  this.labelSizeDescription = 'Continuous';
                  this.labelSizeCode = 'continuous';
                } else if (w > 0 && w < 30) { // 23mm
                  this.labelSizeDescription = '23mm Square';
                  this.labelSizeCode = '23mm';
                } else {
                  this.labelSizeDescription = details.media || 'Continuous';
                  this.labelSizeCode = 'continuous';
                }
              }
              found = true;
            } catch (e) {
              console.error("Error parsing printer details", e);
            }
          }
        }
        if (found) break;
      }
    });
  }

  selectType(type: string): void {
    this.selectedType = type;
  }

  printLabel(): void {
    if (!this.selectedType || !this.selectedDate) return;

    this.labelService.printQuickLabel(
      this.selectedType,
      this.selectedDate,
      this.labelSizeCode
    ).subscribe({
      next: () => {
        this.snackBar.open('Label printed successfully', 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Print failed', err);
        this.snackBar.open('Failed to print label', 'Close', { duration: 3000 });
      }
    });
  }
}
