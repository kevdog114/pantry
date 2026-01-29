import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Product, StockItem } from '../../types/product';
import { ProductListService } from '../product-list/product-list.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface StockAddDialogData {
    product: Product;
    scannedBarcode?: string;
}

@Component({
    selector: 'app-stock-add-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatSnackBarModule,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatDatepickerModule,
        MatCheckboxModule
    ],
    templateUrl: './stock-add-dialog.component.html',
    styleUrls: ['./stock-add-dialog.component.css']
})
export class StockAddDialogComponent {

    stockItem: Partial<StockItem>;

    constructor(
        public dialogRef: MatDialogRef<StockAddDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: StockAddDialogData,
        private svc: ProductListService,
        private snackBar: MatSnackBar
    ) {
        let barcodeId = undefined;
        if (data.scannedBarcode && data.product.barcodes) {
            const bc = data.product.barcodes.find(b => b.barcode === data.scannedBarcode);
            if (bc) barcodeId = bc.id;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        this.stockItem = {
            productId: data.product.id,
            quantity: 1,
            expirationDate: today,
            frozen: false,
            opened: false,
            productBarcodeId: barcodeId
        };
        // Smart expiry logic
        // if(data.product.refrigeratorLifespanDays) {
        //      const d = new Date();
        //      d.setDate(d.getDate() + data.product.refrigeratorLifespanDays);
        //      this.stockItem.expirationDate = d;
        // }
    }

    save() {
        if (!this.stockItem.quantity || this.stockItem.quantity <= 0) return;

        // Finalize
        const itemToSave = { ...this.stockItem } as StockItem;

        this.svc.CreateStock(itemToSave).subscribe({
            next: () => {
                this.snackBar.open("Stock Item Created", "Okay", { duration: 2000 });
                this.dialogRef.close(true);
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open("Failed to create", "Dismiss", { duration: 3000 });
            }
        });
    }

    useScannedBarcodeDescription() {
        if (!this.stockItem.productBarcodeId) return "";
        const bc = this.data.product.barcodes.find(b => b.id === this.stockItem.productBarcodeId);
        if (!bc) return '';
        return `${bc.brand ? bc.brand : ''} ${bc.description ? '- ' + bc.description : ''}`;
    }
}
