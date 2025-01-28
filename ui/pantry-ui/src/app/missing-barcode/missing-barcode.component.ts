import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NavigationExtras, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-missing-barcode',
  imports: [
    MatButtonModule,
    CommonModule,
    RouterModule
  ],
  templateUrl: './missing-barcode.component.html',
  styleUrl: './missing-barcode.component.css'
})
export class MissingBarcodeComponent {

  public ProductName: string = "";
  public foundProduct: boolean = false;
  public searchingProducts: boolean = true;

  private _barcode: string | undefined;

  @Input()
  set barcode(newBarcode: string | undefined) {
    this._barcode = newBarcode;
    this.http.get<any>("https://world.openfoodfacts.org/api/v2/product/" + newBarcode).subscribe(result => {
      console.log(result);
      if(result && result.product){
        var productName = result.product.product_name;
        this.ProductName = productName;
        this.foundProduct = true;
      }
      
      this.searchingProducts = false;
    }, () => {
      this.searchingProducts = false;
    })
  }
  get barcode() {
    return this._barcode;
  }

  /**
   *
   */
  constructor(private http: HttpClient, private router: Router) {
    
  }

  public createProduct = () => {
    var queryOptions: NavigationExtras | undefined = undefined;

    if(this.foundProduct) {
      queryOptions = {
        queryParams: {
          productName: this.ProductName,
          barcodes: [
            this.barcode
          ]
        }
      };
    }

    this.router.navigate(["products", "create"], queryOptions);
  }
}
