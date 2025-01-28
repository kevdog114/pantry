import { Component, Input } from '@angular/core';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product, StockItem } from '../types/product';
import { CommonModule, DatePipe, JsonPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';


interface IndexedBarcode {
  index: number,
  id?: number,
  ProductId: number,
  barcode: string
}

@Component({
  selector: 'app-product-view',
  imports: [
    JsonPipe,
    MatCardModule,
    CommonModule,
    MatTableModule,
    MatButtonModule,
    DatePipe,
    MatProgressSpinnerModule
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
  constructor(private svc: ProductListService) {
    
  }

  UseStock = (stockItem: StockItem, amount: number) => {
    (<any>stockItem).loading_use = true;
    stockItem.quantity -= amount;
    
    this.svc.UpdateStock(stockItem.id!, stockItem).subscribe(a => {
      (<any>stockItem).loading_use = false;
    });
  }
}
