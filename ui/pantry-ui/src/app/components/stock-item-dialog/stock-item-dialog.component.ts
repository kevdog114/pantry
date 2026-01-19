import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Product, StockItem } from '../../types/product';
import { ProductListService } from '../product-list/product-list.service';
import { LabelService } from '../../services/label.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { CommonModule, DatePipe } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

export interface StockItemDialogData {
    stockItem: StockItem;
    product: Product;
    labelSizeCode: string;
    labelSizeDescription: string;
}

@Component({
    selector: 'app-stock-item-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatExpansionModule,
        MatSnackBarModule,
        MatExpansionModule,
        MatSnackBarModule,
        DatePipe,
        MatFormFieldModule,
        MatInputModule,
        FormsModule
    ],
    templateUrl: './stock-item-dialog.component.html',
    styleUrls: ['./stock-item-dialog.component.css']
})
export class StockItemDialogComponent {
    copies: number = 1;

    constructor(
        public dialogRef: MatDialogRef<StockItemDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: StockItemDialogData,
        private svc: ProductListService,
        private labelService: LabelService,
        private snackBar: MatSnackBar,
        private router: Router
    ) { }

    getBarcodeBrand(barcodeId: number): string {
        const bc = this.data.product.barcodes.find(b => b.id === barcodeId);
        if (!bc) return '';
        return `${bc.brand ? bc.brand : ''} ${bc.description ? '- ' + bc.description : ''}`;
    }

    useOne() {
        this.data.stockItem.quantity -= 1;
        this.svc.UpdateStock(this.data.stockItem.id!, this.data.stockItem).subscribe(() => {
            this.snackBar.open("Used 1 Unit", "Okay", { duration: 2000 });
            if (this.data.stockItem.quantity <= 0) {
                this.dialogRef.close();
            }
        });
    }

    edit() {
        this.dialogRef.close();
        this.router.navigate(['/products', this.data.product.id, 'stock-items', this.data.stockItem.id]);
    }

    toggleOpen() {
        const stockItem = this.data.stockItem;
        if (!stockItem.opened) {
            // Open Logic
            if (this.data.product.openedLifespanDays !== null) {
                if (stockItem.frozen)
                    stockItem.expirationExtensionAfterThaw = this.data.product.openedLifespanDays!;
                else
                    stockItem.expirationDate = this.addDays(new Date(), this.data.product.openedLifespanDays!);
            }
            stockItem.opened = true;
            stockItem.openedDate = new Date();
        } else {
            // Un-Open (Sealed) Logic - Optional, but usually implies reverting.
            // For simplicity, just toggle flag. Expiration reverting is complex.
            stockItem.opened = false;
        }

        this.updateStock(stockItem, "Status Updated");
    }

    toggleFreeze() {
        const stockItem = this.data.stockItem;
        const freezing = !stockItem.frozen;

        if (freezing) {
            if (this.data.product.freezerLifespanDays !== null) {
                stockItem.expirationExtensionAfterThaw = this.daysBetween(stockItem.expirationDate, new Date());
                stockItem.expirationDate = this.addDays(new Date(), this.data.product.freezerLifespanDays!);
            }
        }
        else {
            // Thawing
            if (stockItem.expirationExtensionAfterThaw !== null)
                stockItem.expirationDate = this.addDays(new Date(), stockItem.expirationExtensionAfterThaw);
        }

        stockItem.frozen = freezing;
        this.updateStock(stockItem, freezing ? "Frozen" : "Thawed");
    }

    printLabel() {
        this.labelService.printStockLabel(this.data.stockItem.id!, this.data.labelSizeCode, this.copies).subscribe({
            next: () => this.snackBar.open(`Sent ${this.copies} Labels`, "Dismiss", { duration: 3000 }),
            error: (err) => this.snackBar.open("Print Failed", "Dismiss", { duration: 3000 })
        });
    }

    printModifier(type: string) {
        let dateStr = new Date().toISOString().split('T')[0];
        if (type === 'Opened' && this.data.stockItem.openedDate) {
            dateStr = new Date(this.data.stockItem.openedDate).toISOString().split('T')[0];
        }

        const expiry = this.data.stockItem.expirationDate ? new Date(this.data.stockItem.expirationDate).toISOString().split('T')[0] : 'N/A';

        this.labelService.printModifierLabel(type, dateStr, expiry).subscribe({
            next: () => this.snackBar.open("Modifier Label Sent", "Dismiss", { duration: 3000 }),
            error: (err) => this.snackBar.open("Print Failed", "Dismiss", { duration: 3000 })
        });
    }

    private updateStock(item: StockItem, msg: string) {
        this.svc.UpdateStock(item.id!, item).subscribe(() => {
            this.snackBar.open(msg, "Okay", { duration: 2000 });
        });
    }

    private addDays(dt: Date, days: number): Date {
        const d = new Date(dt);
        d.setDate(d.getDate() + days);
        return d;
    }

    private daysBetween(dt1: Date, dt2: Date): number {
        dt1 = new Date(dt1);
        dt1.setHours(0, 0, 0, 0);
        dt2 = new Date(dt2);
        dt2.setHours(0, 0, 0, 0);
        const res = (dt1.getTime() - dt2.getTime()) / (1000 * 60 * 60 * 24);
        return Math.ceil(res);
    }
}
