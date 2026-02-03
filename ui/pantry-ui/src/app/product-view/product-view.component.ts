import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
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
import { KioskService } from '../services/kiosk.service';
import { EnvironmentService } from '../services/environment.service';


interface IndexedBarcode {
  index: number,
  id?: number,
  ProductId: number,
  barcode: string
}

import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AudioChatDialogComponent } from '../components/audio-chat-dialog/audio-chat-dialog.component';
import { LabelService } from '../services/label.service';
import { Router, RouterModule } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StockItemDialogComponent } from '../components/stock-item-dialog/stock-item-dialog.component';
import { StockAddDialogComponent } from '../components/stock-add-dialog/stock-add-dialog.component';
import { QuantityPromptDialogComponent } from '../components/quantity-prompt-dialog/quantity-prompt-dialog.component';
import { RecipeCardComponent, ChatRecipe } from '../components/recipe-card/recipe-card.component';

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
    MatDialogModule,
    RouterModule,
    RouterModule,
    MatTooltipModule,
    RecipeCardComponent
  ],
  templateUrl: './product-view.component.html',
  styleUrl: './product-view.component.scss'
})
export class ProductViewComponent implements OnChanges {
  private barcodeIndex: number = 0;
  public product: Product | undefined;
  public _stockId: number | undefined;

  @Input("stock-id")
  set stockId(newStockId: number | string | undefined) {
    if (newStockId)
      this._stockId = Number(newStockId);
    else
      this._stockId = undefined;

    this.checkAndOpenStockDialog();
  }
  get stockId() {
    return this._stockId;
  }

  @Input("create-stock") createStock: string | undefined;
  @Input("scanned-barcode") scannedBarcode: string | undefined;

  @Input()
  set id(productId: number) {
    this.svc.Get(productId).subscribe(p => {
      this.product = p;
      this.checkAndOpenStockDialog();
      this.checkAndOpenCreateDialog();
    });
  }

  /**
   *
   */
  public labelSizeDescription: string = 'Standard';
  public labelSizeCode: string = 'standard';

  constructor(
    private svc: ProductListService,
    private snackbar: MatSnackBar,
    private dialog: MatDialog,
    private labelService: LabelService,
    private kioskService: KioskService,
    private env: EnvironmentService,
    private router: Router
  ) {
    this.detectPrinterMedia();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stockId']) {
      this.checkAndOpenStockDialog();
    }
    if (changes['createStock']) {
      this.checkAndOpenCreateDialog();
    }
  }

  private hasOpenedDialogForStockId: number | undefined = undefined;

  checkAndOpenCreateDialog() {
    if (this.product && this.createStock === 'true') {
      setTimeout(() => {
        const dialogRef = this.dialog.open(StockAddDialogComponent, {
          data: {
            product: this.product,
            scannedBarcode: this.scannedBarcode
          },
          width: '400px',
          maxWidth: '95vw'
        });

        dialogRef.afterClosed().subscribe(result => {
          this.router.navigate([], {
            queryParams: {
              'create-stock': null,
              'scanned-barcode': null
            },
            queryParamsHandling: 'merge'
          });

          if (result) {
            if (this.product?.id) {
              this.svc.Get(this.product.id).subscribe(p => this.product = p);
            }
          }
        });
      }, 100);
    }
  }

  checkAndOpenStockDialog() {
    if (this.product && this._stockId) {
      if (this.hasOpenedDialogForStockId === this._stockId) {
        return; // Already opened for this ID
      }

      const stockItem = this.product.stockItems.find(i => i.id === this._stockId);
      if (stockItem) {
        this.hasOpenedDialogForStockId = this._stockId;

        // Slight delay to ensure UI is ready
        setTimeout(() => {
          const dialogRef = this.dialog.open(StockItemDialogComponent, {
            data: {
              stockItem: stockItem,
              product: this.product,
              labelSizeCode: this.labelSizeCode,
              labelSizeDescription: this.labelSizeDescription
            },
            width: '400px',
            maxWidth: '95vw',
            panelClass: 'stock-item-popup'
          });

          dialogRef.afterClosed().subscribe(() => {
            // Clear the query param so they can re-scan or just to clean up URL
            this.router.navigate([], {
              queryParams: { 'stock-id': null },
              queryParamsHandling: 'merge'
            });
            this.hasOpenedDialogForStockId = undefined;
            this._stockId = undefined;
          });
        }, 100);
      }
    }
  }

  detectPrinterMedia() {
    this.kioskService.getKiosks().subscribe(kiosks => {
      // Find first online printer
      let found = false;
      for (const kiosk of kiosks) {
        if (kiosk.devices) {
          const printer = kiosk.devices.find(d => d.type === 'PRINTER' && (d.status === 'ONLINE' || d.status === 'READY'));
          if (printer && printer.details) {
            try {
              const details = typeof printer.details === 'string' ? JSON.parse(printer.details) : printer.details;
              // Check detected label width
              if (details.detected_label) {
                const w = details.detected_label.width;
                if (w >= 50) { // 62mm usually reads around 58-62 depending on printer
                  this.labelSizeDescription = '62mm Standard';
                  this.labelSizeCode = 'standard';
                } else if (w > 0 && w < 30) { // 23mm
                  this.labelSizeDescription = '23mm Square';
                  this.labelSizeCode = '23mm';
                } else {
                  // Fallback or use media string
                  this.labelSizeDescription = details.media || 'Standard';
                  this.labelSizeCode = 'standard';
                }
              }
              found = true;
            } catch (e) {
              console.error("Error parsing printer details", e);
            }
          }
        }
        if (found) break;
      }
    });
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
    stockItem.openedDate = new Date();
    this.svc.UpdateStock(stockItem.id!, stockItem).subscribe(() => {
      this.snackbar.open("Updated stock item", "Okay", {
        duration: 5000
      });
    });
  }

  setFrozen = (stockItem: StockItem, isFrozen: boolean) => {
    // Partial thaw logic
    if (!isFrozen && stockItem.quantity > 1) {
      this.dialog.open(QuantityPromptDialogComponent, {
        data: {
          title: 'Thaw Quantity',
          message: `How many units do you want to thaw? (Total: ${stockItem.quantity})`,
          max: stockItem.quantity,
          current: 1 // Default to 1 for thawing one item
        },
        width: '300px'
      }).afterClosed().subscribe((qty: number | undefined) => {
        if (!qty) return;

        if (qty < stockItem.quantity) {
          this.handlePartialThaw(stockItem, qty);
        } else {
          this.processFrozenToggle(stockItem, isFrozen);
        }
      });
      return;
    }

    this.processFrozenToggle(stockItem, isFrozen);
  }

  processFrozenToggle = (stockItem: StockItem, isFrozen: boolean) => {
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

  handlePartialThaw = (originalStock: StockItem, qtyToThaw: number) => {
    // Deduct from original (Frozen)
    originalStock.quantity -= qtyToThaw;
    this.svc.UpdateStock(originalStock.id!, originalStock).subscribe(() => {

      // Create new (Thawed)
      const newStock: StockItem = { ...originalStock };
      newStock.id = undefined;
      newStock.quantity = qtyToThaw;
      newStock.frozen = false;

      if (newStock.expirationExtensionAfterThaw !== null) {
        newStock.expirationDate = this.addDays(new Date(), newStock.expirationExtensionAfterThaw);
      }

      this.svc.CreateStock(newStock).subscribe(createdItem => {
        // Add to list
        this.product?.stockItems.push(createdItem);

        // Trigger dialog
        this._stockId = createdItem.id;
        this.checkAndOpenStockDialog();

        this.snackbar.open(`Thawed ${qtyToThaw} units`, "Okay", { duration: 3000 });
      });
    });
  }

  printStockLabel(stockItem: StockItem, size: string = 'standard') {
    this.labelService.printStockLabel(stockItem.id!, size).subscribe({
      next: (res) => {
        this.snackbar.open(res.message || "Label Sent", "Okay", { duration: 3000 });
      },
      error: (err) => {
        this.snackbar.open("Failed to print label", "Dismiss", { duration: 5000 });
        console.error(err);
      }
    });
  }

  printMultipleStockLabels(stockItem: StockItem, size: string = 'standard') {
    const quantity = Math.floor(stockItem.quantity);
    if (quantity <= 0) return;

    this.snackbar.open(`Sending ${quantity} labels...`, "Dismiss", { duration: 2000 });

    this.labelService.printStockLabel(stockItem.id!, size, quantity).subscribe({
      next: (res) => {
        this.snackbar.open(res.message || `Sent ${quantity} labels`, "Okay", { duration: 3000 });
      },
      error: (err) => {
        this.snackbar.open("Failed to print labels", "Dismiss", { duration: 5000 });
        console.error(err);
      }
    });
  }

  printModifier(stockItem: StockItem, action: string) {
    let dateStr = new Date().toISOString().split('T')[0];

    if (action === 'Opened' && stockItem.openedDate) {
      dateStr = new Date(stockItem.openedDate).toISOString().split('T')[0];
    }

    const expiry = stockItem.expirationDate ? new Date(stockItem.expirationDate).toISOString().split('T')[0] : 'N/A';
    this.labelService.printModifierLabel(action, dateStr, expiry).subscribe({
      next: (res) => {
        this.snackbar.open(res.message || "Modifier Label Sent", "Okay", { duration: 3000 });
      },
      error: (err) => {
        this.snackbar.open("Failed to print label", "Dismiss", { duration: 5000 });
        console.error(err);
      }
    });
  }

  public GetFileDownloadUrl = (stockItem: any): string => {
    // Logic from product-list.component.ts but adapted if needed.
    // Wait, product-list uses product.files. 
    // This view has 'product' property.
    if (this.product && this.product.files && this.product.files.length > 0)
      return this.env.apiUrl + "/files/" + this.product.files[0].id + "?size=medium";
    else
      return "";
  }

  getReservedAmount(stockItem: StockItem): number {
    if (stockItem.reservations) {
      return stockItem.reservations.reduce((acc, r) => acc + r.amount, 0);
    }
    return 0;
  }

  toChatRecipe(instruction: any): ChatRecipe {
    return {
      title: instruction.name,
      description: instruction.description,
      ingredients: [],
      instructions: instruction.steps.map((s: any) => s.instruction),
      time: {
        prep: instruction.prepTime ? instruction.prepTime + ' m' : '',
        cook: instruction.cookTime ? instruction.cookTime + ' m' : '',
        total: ((instruction.prepTime || 0) + (instruction.cookTime || 0)) + ' m'
      }
    };
  }
}

