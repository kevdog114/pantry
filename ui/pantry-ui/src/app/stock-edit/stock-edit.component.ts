import { AfterViewInit, Component, Input } from '@angular/core';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product, StockItem } from '../types/product';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-stock-edit',
  imports: [
    CommonModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
    MatDatepickerModule,
    MatCardModule,
    MatButtonModule,
    MatCheckboxModule,
    MatOptionModule,
    MatSelectModule
  ],
  templateUrl: './stock-edit.component.html',
  styleUrl: './stock-edit.component.css'
})
export class StockEditComponent implements AfterViewInit {

  private _productId: number | undefined;
  private _stockId: number | undefined;
  public product: Product | undefined;
  public stockItem: StockItem | undefined;
  public get IsCreate() { return this._stockId === undefined };


  @Input()
  set productId(newProductId: string) {
    this._productId = parseInt(newProductId, 10);
  }

  @Input()
  set stockId(newStockId: number) {
    this._stockId = newStockId;
  }

  /**
   *
   */
  constructor(private svc: ProductListService, private router: Router) {
  }

  ngAfterViewInit(): void {
    if (this._productId !== undefined) {

      this.svc.Get(this._productId).subscribe(product => {
        console.log(product);
        this.product = product;
        var matchingStock: StockItem | undefined = undefined;
        if (this._stockId !== undefined) {
          matchingStock = product.stockItems.find(a => a.id == this._stockId);
        }
        if (matchingStock !== undefined)
          this.stockItem = matchingStock;
        else {
          var newStock: Partial<StockItem> = {
            expirationDate: new Date(),
            productId: this._productId!,
            quantity: 1,
            frozen: false,
            opened: false
          };

          this.stockItem = <StockItem>newStock;
        }
      });
    }
  }

  public delete = () => {
    if (this.stockItem && this.stockItem.id)
      this.svc.DeleteStock(this.stockItem.id).subscribe(() => {
        this.router.navigate(["/products", this._productId]);
      })
  }

  public Save = () => {
    if (this.stockItem === undefined)
      return;

    let navToProduct = () => {
      this.router.navigate(['products', this._productId]);

    }

    if (this._stockId === undefined) {
      // create
      this.svc.CreateStock(this.stockItem).subscribe(() => {
        navToProduct();
      });
    }
    else {
      this.svc.UpdateStock(this.stockItem.id!, this.stockItem).subscribe(() => {
        navToProduct();
      });
    }
  }
}
