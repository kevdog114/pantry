import { Component, Input } from '@angular/core';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product, StockItem } from '../types/product';
import { CommonModule, DatePipe, JsonPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { dateTimestampProvider } from 'rxjs/internal/scheduler/dateTimestampProvider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';


interface IndexedBarcode {
  index: number,
  id?: number,
  ProductId: number,
  barcode: string
}

import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AudioChatDialogComponent } from '../components/audio-chat-dialog/audio-chat-dialog.component';

@Component({
  selector: 'app-product-view',
  imports: [
    JsonPipe,
    MatCardModule,
    CommonModule,
    MatTableModule,
    MatButtonModule,
    DatePipe,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    MatDialogModule
  ],
  templateUrl: './product-view.component.html',
  styleUrl: './product-view.component.scss'
})
export class ProductViewComponent {
  private barcodeIndex: number = 0;
  public product: Product | undefined;
  public _stockId: number | undefined;

  @Input("stock-id")
  set stockId(newStockId: number | undefined) {
    this._stockId = newStockId;
  }
  get stockId() {
    return this._stockId;
  }

  @Input()
  set id(productId: number) {
    this.svc.Get(productId).subscribe(p => {
      this.product = p;
    });
  }

  /**
   *
   */
  constructor(private svc: ProductListService, private snackbar: MatSnackBar, private dialog: MatDialog) {

  }

  openAudioChat() {
    if (this.product) {
      this.dialog.open(AudioChatDialogComponent, {
        data: { product: this.product },
        width: '350px',
        position: { bottom: '100px', right: '30px' },
        hasBackdrop: false,
        panelClass: 'audio-chat-popup-panel'
      });
    }
  }

  UseStock = (stockItem: StockItem, amount: number) => {
    (<any>stockItem).loading_use = true;
    stockItem.quantity -= amount;

    this.svc.UpdateStock(stockItem.id!, stockItem).subscribe(a => {
      (<any>stockItem).loading_use = false;
    });
  }

  private addDays = (dt: Date, days: number): Date => {

    dt.setDate(dt.getDate() + days);
    return dt;
  }

  private daysBetween = (dt1: Date, dt2: Date): number => {
    dt1 = new Date(dt1);
    dt1.setHours(0, 0, 0, 0);
    dt2 = new Date(dt2);
    dt2.setHours(0, 0, 0, 0);
    var res = (dt1.getTime() - dt2.getTime()) / (1000 * 60 * 60 * 24);
    return Math.ceil(res);
  }

  setOpened = (stockItem: StockItem) => {
    if (this.product?.openedLifespanDays !== null) {
      if (stockItem.frozen)
        stockItem.expirationExtensionAfterThaw = this.product?.openedLifespanDays!;
      else
        stockItem.expirationDate = this.addDays(new Date(), this.product?.openedLifespanDays!);
    }

    stockItem.opened = true;
    this.svc.UpdateStock(stockItem.id!, stockItem).subscribe(() => {
      this.snackbar.open("Updated stock item", "Okay", {
        duration: 5000
      });
    });
  }

  setFrozen = (stockItem: StockItem, isFrozen: boolean) => {
    if (isFrozen) {
      if (this.product?.freezerLifespanDays !== null) {
        stockItem.expirationExtensionAfterThaw = this.daysBetween(stockItem.expirationDate, new Date());
        stockItem.expirationDate = this.addDays(new Date(), this.product?.freezerLifespanDays!);
      }
    }
    else {
      if (stockItem.expirationExtensionAfterThaw !== null)
        stockItem.expirationDate = this.addDays(new Date(), stockItem.expirationExtensionAfterThaw);
    }

    stockItem.frozen = isFrozen;
    this.svc.UpdateStock(stockItem.id!, stockItem).subscribe(() => {
      this.snackbar.open("Updated stock item", "Okay", {
        duration: 5000
      });
    });
  }
}
