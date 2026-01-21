import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { EnvironmentService } from './services/environment.service';
import { SocketService } from './services/socket.service';
import { ProductBarcode, Product } from './types/product';
import { Router } from '@angular/router';

import { HardwareService } from './services/hardware.service';

@Injectable({
  providedIn: 'root'
})
export class HardwareBarcodeScannerService {

  public BarcodeSearch = new BehaviorSubject<string | null>(null);

  // Track if this kiosk's scanner is claimed by another device
  public claimedBySubject = new BehaviorSubject<string | null>(null);
  public claimedBy$ = this.claimedBySubject.asObservable();

  constructor(private http: HttpClient, private router: Router, private env: EnvironmentService, private hardwareService: HardwareService, private socketService: SocketService) {
    console.log("Starting barcode scanner service");
    this.socketService.on('barcode_scan', (data: any) => {
      console.log("Received barcode from bridge:", data);
      if (data && data.barcode) {
        this.handleScannedBarcode(data.barcode);
      }
    });

    this.socketService.on('scanner_claimed', (data: any) => {
      console.log('Scanner claimed event:', data);
      if (data.success) {
        // We successfully claimed it
        this.claimedBySubject.next("Me");
      }
    });

    this.socketService.on('scanner_released', () => {
      console.log('Scanner released event');
      this.claimedBySubject.next(null);
    });
  }

  public claimScanner(kioskId: number) {
    this.socketService.emit('claim_scanner', kioskId);
  }

  public releaseScanner(kioskId: number) {
    this.socketService.emit('release_scanner', kioskId);
  }

  private currentBarcode: string = "";
  private isScanning: boolean = false;
  private isEnabled: boolean = true;
  private customHandler: ((barcode: string) => void) | null = null;

  public setCustomHandler(handler: ((barcode: string) => void) | null) {
    this.customHandler = handler;
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
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
          this.router.navigate(["products", result.id], {
            queryParams: {
              'create-stock': 'true',
              'scanned-barcode': barcode
            }
          });
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

        this.handleScannedBarcode(this.currentBarcode);
      }
      else if (this.isScanning) {
        if (event.key.length === 1) {
          this.currentBarcode = this.currentBarcode + event.key;
        }
      }
    });
  }

  private handleScannedBarcode(barcode: string) {
    console.log("Scanned barcode:", barcode);
    // strip the leading slash if it exists
    if (barcode != null && barcode.startsWith("/")) {
      barcode = barcode.substring(1);
    }
    if (this.customHandler) {
      this.customHandler(barcode);
    } else {
      this.BarcodeSearch.next(barcode);
      console.log("Search for", barcode);
      this.searchForBarcode(barcode);
    }
  }
}
