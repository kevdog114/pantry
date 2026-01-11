import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../environments/environment';
import { ProductBarcode, Product } from './types/product';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class HardwareBarcodeScannerService {

  public BarcodeSearch = new BehaviorSubject<string | null>(null);
  constructor(private http: HttpClient, private router: Router) { }

  private currentBarcode: string = "";
  private isScanning: boolean = false;

  public searchForBarcode = (barcode: string) => {
    if (barcode.toLowerCase().startsWith("st-")) {
      // legacy stock item barcode
    }
    else if (barcode.toLowerCase().startsWith("sk-")) {
      // new stock item barcode
      barcode = barcode.substring(3);
      this.http.get<ProductBarcode>(environment.apiUrl + "/stock-items/" + barcode).subscribe(result => {
        if (result) {
          this.router.navigate(["products", result.ProductId], {
            queryParams: {
              "stock-id": result.id
            }
          });
        }
      })
    }
    else if (barcode.toLowerCase().startsWith("s2-")) {
      // new s2 stock item barcode
      barcode = barcode.substring(3);
      this.http.get<any>(environment.apiUrl + "/stock-items/" + barcode).subscribe(result => {
        if (result) {
          // Result likely contains ProductId (or product.id)
          // Adjust based on expected return of /stock-items/:id
          // Assuming it returns StockItem object which has productId or product: { id }
          const productId = result.ProductId || result.productId || result.product?.id;

          if (productId) {
            this.router.navigate(["products", productId], {
              queryParams: {
                "stock-id": result.id
              }
            });
          }
        }
      })
    }
    else {
      // assume product barcode
      let missingBarcodeRedir = () => {
        this.router.navigate(["barcode", "lookup"], {
          queryParams: {
            barcode: barcode
          }
        })
      }
      this.http.get<Product>(environment.apiUrl + "/barcodes/products?barcode=" + barcode).subscribe(result => {
        if (result) {
          this.router.navigate(["products", result.id]);
        }
        else {
          missingBarcodeRedir();
        }
      }, missingBarcodeRedir);
    }
  }

  public ListenForScanner = () => {
    document.addEventListener('keydown', (event) => {
      //console.log("keydown", event.key);
      // Code to execute when a key is pressed
      if (event.key == '/') {
        var targetElement = event.target as Element;
        if (targetElement.tagName.toLowerCase() == "input") {
          if (targetElement.classList.contains("barcode-input")) {
            // if you scan while in a barcode text field, then don't include the leading slash
            event.preventDefault();
          }
        }
        else {
          this.isScanning = true;
          this.currentBarcode = "";
        }
      }
      else if (this.isScanning && event.key.toLowerCase() == "enter") {
        this.isScanning = false;
        this.BarcodeSearch.next(this.currentBarcode);
        console.log("Search for", this.currentBarcode);
        this.searchForBarcode(this.currentBarcode);
      }
      else if (this.isScanning) {
        this.currentBarcode = this.currentBarcode + event.key;
      }
      /*if(event.key == '/' && (event.target == null || event.target.tagName.toLowerCase() != 'input'))
      {
          var inp = document.createElement("input");
          //inp.style.display = "none";
          document.body.append(inp);
          inp.focus();
          inp.addEventListener("keydown", function(e) {
              if(e.code == 'Enter')
              {
                  var barcodeValue = inp.value;
                  if(barcodeValue.startsWith("/"))
                      barcodeValue = barcodeValue.substring(1);
  
                  searchByBarcode(barcodeValue);
                  inp.remove();
              }
          });
      }*/
    });
  }
}
