import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LocationService } from '../services/location.service';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { EnvironmentService } from '../services/environment.service';
import { Location, StockItem, Product } from '../types/product';
import { firstValueFrom } from 'rxjs';

interface AuditItem {
    stockItem: StockItem;
    found: boolean;
    productName: string;
}

interface ExtraItem {
    barcode: string;
    product?: Product;
    stockItemId?: number; // if sk- barcode
    count: number;
}

@Component({
    selector: 'app-audit-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './audit-page.component.html',
    styleUrls: ['./audit-page.component.css']
})
export class AuditPageComponent implements OnInit, OnDestroy {
    locations: Location[] = [];
    selectedLocationId: number | null = null;
    selectedLocation: Location | null = null;

    expectedItems: AuditItem[] = [];
    extraItems: ExtraItem[] = []; // Items found but not expected

    isLoading = false;
    auditFinished = false;

    missingItemsResult: AuditItem[] = []; // For summary

    // View helper
    selectedLocationIdAsInput: number | null = null;

    constructor(
        private locationService: LocationService,
        private scannerService: HardwareBarcodeScannerService,
        private http: HttpClient,
        private env: EnvironmentService
    ) { }

    onLocationChange(event: any) {
        const val = event.target.value;
        if (val && val !== 'null') {
            this.selectLocation(parseInt(val));
        }
    }

    reset() {
        this.selectedLocationId = null;
        this.selectedLocationIdAsInput = null;
        this.selectedLocation = null;
        this.expectedItems = [];
        this.extraItems = [];
        this.auditFinished = false;
        this.missingItemsResult = [];
    }

    ngOnInit(): void {
        this.loadLocations();
        // Register custom handler
        this.scannerService.setCustomHandler((barcode) => this.handleScan(barcode));
    }

    ngOnDestroy(): void {
        // Clear custom handler
        this.scannerService.setCustomHandler(null);
    }

    loadLocations() {
        this.locationService.getAll().subscribe(locs => {
            this.locations = locs;
        });
    }

    async selectLocation(id: number) {
        this.selectedLocationId = id;
        this.isLoading = true;
        this.auditFinished = false;
        this.expectedItems = [];
        this.extraItems = [];

        try {
            const loc = await firstValueFrom(this.locationService.getById(id));
            this.selectedLocation = loc;
            if (loc.stockItems) {
                this.expectedItems = loc.stockItems.map(item => ({
                    stockItem: item,
                    found: false,
                    productName: item.product?.title || 'Unknown Product'
                }));
            }
        } catch (err) {
            console.error('Error loading location', err);
        } finally {
            this.isLoading = false;
        }
    }

    async handleScan(barcode: string) {
        if (!this.selectedLocationId || this.auditFinished) return;

        console.log('Audit Scan:', barcode);

        // Case 1: Stock Item Barcode (sk-)
        if (barcode.toLowerCase().startsWith('sk-')) {
            const stockId = parseInt(barcode.substring(3));
            if (!isNaN(stockId)) {
                this.processStockIdScan(stockId, barcode);
                return;
            }
        }

        // Case 2: Product Barcode
        // Resolve barcode to product first
        try {
            // Check if it's a known product barcode
            const product = await this.resolveProductBarcode(barcode);
            if (product) {
                this.processProductScan(product, barcode);
            } else {
                // Unknown barcode
                alert(`Unknown barcode: ${barcode}`);
            }
        } catch (err) {
            console.error(err);
        }
    }

    processStockIdScan(stockId: number, barcode: string) {
        // Check if expected
        const expectedIdx = this.expectedItems.findIndex(i => i.stockItem.id === stockId);
        if (expectedIdx >= 0) {
            this.expectedItems[expectedIdx].found = true;
            // Play success sound?
        } else {
            // It's an extra item (specific stock item moved here)
            // Check if we already have it in extras
            const existingExtra = this.extraItems.find(e => e.stockItemId === stockId);
            if (!existingExtra) {
                this.addExtraItem(barcode, undefined, stockId);
            }
        }
    }

    processProductScan(product: Product, barcode: string) {
        // Check if we have an unfound expected item for this product
        const candidateIdx = this.expectedItems.findIndex(i => i.stockItem.productId === product.id && !i.found);

        if (candidateIdx >= 0) {
            // Mark as found
            this.expectedItems[candidateIdx].found = true;
        } else {
            // Extra item
            // Check if we already have a record for this extra product to increment count? 
            // Or just add new entry. User might verify quantity manually.
            // For simplicity, let's group by barcode/product
            const existing = this.extraItems.find(e => e.product?.id === product.id);
            if (existing) {
                existing.count++;
            } else {
                this.addExtraItem(barcode, product);
            }
        }
    }

    addExtraItem(barcode: string, product?: Product, stockItemId?: number) {
        this.extraItems.push({
            barcode,
            product,
            stockItemId,
            count: 1
        });
    }

    async resolveProductBarcode(barcode: string): Promise<Product | null> {
        // Use existing API to resolve barcode
        try {
            const res = await firstValueFrom(this.http.get<Product>(`${this.env.apiUrl}/barcodes/products?barcode=${barcode}`));
            return res;
        } catch (e) {
            return null;
        }
    }

    finishAudit() {
        this.auditFinished = true;
        this.missingItemsResult = this.expectedItems.filter(i => !i.found);
    }

    async moveItemToHere(extra: ExtraItem) {
        if (!this.selectedLocationId) return;

        // Logic to move item
        // If it's a specific stock item (sk-), update it.
        if (extra.stockItemId) {
            await this.updateStockLocation(extra.stockItemId, this.selectedLocationId);
            // Remove from extra items list or mark done?
            // Ideally reload?
            alert(`Moved stock item ${extra.stockItemId} to this location.`);
        } else if (extra.product) {
            // It's a generic product scan. We don't know WHICH stock item it is if it came from elsewhere.
            // However, user prompt said: "move items to that location if the user scans items that aren't there already"
            // If it's a new product, we might need to CREATE a stock item?
            // Or does it mean we assume it's one of the existing stock items of that product found elsewhere?
            // That's risky/ambiguous. 
            // For now, I'll fallback to "Create new stock item" if it's a product scan not matching expected.
            // create stock item
            await this.createStockItem(extra.product.id, this.selectedLocationId);
            alert(`Created new stock entry for ${extra.product.title} in this location.`);
        }

        // Remove from UI list for visual feedback
        const idx = this.extraItems.indexOf(extra);
        if (idx >= 0) {
            // If count > 1, decrement?
            if (extra.count > 1) {
                extra.count--;
                // Repeat the action for others? User has to click multiple times?
                // Maybe "Move All"?
            } else {
                this.extraItems.splice(idx, 1);
            }
        }
    }

    async updateStockLocation(stockId: number, locationId: number) {
        await firstValueFrom(this.http.put(`${this.env.apiUrl}/stock-items/${stockId}`, {
            locationId: locationId
        }));
    }

    async createStockItem(productId: number, locationId: number) {
        await firstValueFrom(this.http.post(`${this.env.apiUrl}/stock-items`, {
            productId,
            locationId,
            quantity: 1 // Default to 1 per scan
        }));
    }
}
