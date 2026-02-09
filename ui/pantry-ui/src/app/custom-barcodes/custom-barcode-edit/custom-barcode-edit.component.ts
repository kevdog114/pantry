import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CustomBarcodeService } from '../../services/custom-barcode.service';

@Component({
    selector: 'app-custom-barcode-edit',
    standalone: true,
    imports: [
        CommonModule, FormsModule, MatFormFieldModule, MatInputModule,
        MatButtonModule, MatIconModule, RouterModule, MatSnackBarModule,
        MatProgressSpinnerModule
    ],
    templateUrl: './custom-barcode-edit.component.html',
    styleUrls: ['./custom-barcode-edit.component.css']
})
export class CustomBarcodeEditComponent implements OnInit {
    title = '';
    data = '';
    id: number | null = null;
    isNew = true;
    saving = false;
    printing = false;
    isDeleting = false;

    constructor(
        private barcodeService: CustomBarcodeService,
        private route: ActivatedRoute,
        private router: Router,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.isNew = false;
            this.id = parseInt(idParam);
            this.barcodeService.getById(this.id).subscribe(barcode => {
                this.title = barcode.title;
                this.data = barcode.data;
            });
        }
    }

    save(): void {
        if (!this.data.trim()) return;
        this.saving = true;

        if (this.isNew) {
            this.barcodeService.create({ title: this.title, data: this.data }).subscribe({
                next: (saved) => {
                    this.saving = false;
                    this.snackBar.open('Barcode created!', 'OK', { duration: 3000 });
                    this.router.navigate(['/custom-barcodes']);
                },
                error: () => {
                    this.saving = false;
                    this.snackBar.open('Failed to create barcode', 'OK', { duration: 3000 });
                }
            });
        } else {
            this.barcodeService.update(this.id!, { title: this.title, data: this.data }).subscribe({
                next: () => {
                    this.saving = false;
                    this.snackBar.open('Barcode updated!', 'OK', { duration: 3000 });
                    this.router.navigate(['/custom-barcodes']);
                },
                error: () => {
                    this.saving = false;
                    this.snackBar.open('Failed to update barcode', 'OK', { duration: 3000 });
                }
            });
        }
    }

    delete(): void {
        if (!confirm('Are you sure you want to delete this barcode?')) return;
        this.isDeleting = true;
        this.barcodeService.delete(this.id!).subscribe({
            next: () => {
                this.snackBar.open('Barcode deleted', 'OK', { duration: 3000 });
                this.router.navigate(['/custom-barcodes']);
            },
            error: () => {
                this.isDeleting = false;
                this.snackBar.open('Failed to delete barcode', 'OK', { duration: 3000 });
            }
        });
    }

    printLabel(): void {
        this.printing = true;
        this.barcodeService.printLabel(this.id!).subscribe({
            next: () => {
                this.printing = false;
                this.snackBar.open('Label sent to printer!', 'OK', { duration: 3000 });
            },
            error: (err) => {
                this.printing = false;
                const msg = err.error?.message || 'Failed to print label';
                this.snackBar.open(msg, 'OK', { duration: 5000 });
            }
        });
    }

    printReceipt(): void {
        const includeTitle = confirm('Include the title on the receipt?');
        this.printing = true;
        this.barcodeService.printReceipt(this.id!, includeTitle).subscribe({
            next: () => {
                this.printing = false;
                this.snackBar.open('Receipt sent to printer!', 'OK', { duration: 3000 });
            },
            error: (err) => {
                this.printing = false;
                const msg = err.error?.message || 'Failed to print receipt';
                this.snackBar.open(msg, 'OK', { duration: 5000 });
            }
        });
    }

    get fullBarcodePreview(): string {
        return this.data.trim() ? `HA:${this.data.trim()}` : '';
    }
}
