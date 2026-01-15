import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EnvironmentService } from './services/environment.service';
import { ProductBarcode, Product } from './types/product';
import { Router } from '@angular/router';
import { SocketService } from './services/socket.service';

@Injectable({
  providedIn: 'root'
})
export class HardwareBarcodeScannerService {

  public BarcodeSearch = new BehaviorSubject<string | null>(null);

  // Track if this kiosk's scanner is claimed by another device
  public claimedBySubject = new BehaviorSubject<string | null>(null);
  public claimedBy$ = this.claimedBySubject.asObservable();

  constructor(private http: HttpClient, private router: Router, private socketService: SocketService, private env: EnvironmentService) {
    // Listen for events indicating our scanner has been claimed/released
    this.socketService.on('scanner_claimed', (data: { by: string }) => {
      console.log("Scanner claimed by:", data.by);
      this.claimedBySubject.next(data.by);
    });

    this.socketService.on('scanner_released', () => {
      console.log("Scanner released");
      this.claimedBySubject.next(null);
    });

    // Listen for incoming barcode scans (if we are the one who claimed another scanner)
    this.socketService.on('barcode_scan', (data: { barcode: string }) => {
      console.log("Received remote barcode scan:", data.barcode);
      this.searchForBarcode(data.barcode);
    });
  }

  private currentBarcode: string = "";
  private isScanning: boolean = false;
  private isEnabled: boolean = true;

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public forceReleaseScanner() {
    this.socketService.emit('force_release_scanner');
  }

  public searchForBarcode = (barcode: string) => {
    if (barcode.toLowerCase().startsWith("r-")) {
      // recipe barcode
      barcode = barcode.substring(2);
      this.http.get<ProductBarcode>(this.env.apiUrl + "/recipes/" + barcode).subscribe(result => {
        if (result) {
          this.router.navigate(["recipes", result.id]);
        }
      })
    }
    else if (barcode.toLowerCase().startsWith("sk-")) {
      // new stock item barcode
      barcode = barcode.substring(3);
      this.http.get<ProductBarcode>(this.env.apiUrl + "/stock-items/" + barcode).subscribe(result => {
        if (result) {
          this.router.navigate(["products", result.ProductId], {
            queryParams: {
              "stock-id": result.id
            }
          });
        }
      })
    }
    else if (barcode.toLowerCase().startsWith("e-")) {
      // equipment barcode
      barcode = barcode.substring(2);
      this.router.navigate(["equipment", "edit", barcode]);
    }
    else if (barcode.toLowerCase().startsWith("s2-")) {
      // new s2 stock item barcode
      barcode = barcode.substring(3);
      this.http.get<any>(this.env.apiUrl + "/stock-items/" + barcode).subscribe(result => {
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
      this.http.get<Product>(this.env.apiUrl + "/barcodes/products?barcode=" + barcode).subscribe(result => {
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
    // Ensure socket is initialized if it wasn't already (e.g. late login)
    // this.socketService.initSocket(); // Moved logic to Service or App init to avoid redundancy

    document.addEventListener('keydown', (event) => {
      if (!this.isEnabled) return;

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

        // Check if we are claimed
        if (this.claimedBySubject.value) {
          console.log("Forwarding scan to owner:", this.claimedBySubject.value);
          this.socketService.emit('barcode_scan', { barcode: this.currentBarcode });
        } else {
          this.BarcodeSearch.next(this.currentBarcode);
          console.log("Search for", this.currentBarcode);
          this.searchForBarcode(this.currentBarcode);
        }
      }
      else if (this.isScanning) {
        if (event.key.length === 1) {
          this.currentBarcode = this.currentBarcode + event.key;
        }
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
