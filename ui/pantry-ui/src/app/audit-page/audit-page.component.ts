import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LocationService } from '../services/location.service';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { EnvironmentService } from '../services/environment.service';
import { Location, StockItem, Product } from '../types/product';
import { firstValueFrom, Subscription } from 'rxjs';
import { ProductListService } from '../components/product-list/product-list.service';
import { TagsService } from '../tags.service';
import { ProductTags } from '../types/product';
import { KioskService, Kiosk } from '../services/kiosk.service';

interface AuditItem {
    stockItems: StockItem[];
    found: boolean;
    productName: string;
    reportedQuantity: number;
    scannedCount: number;
    initialQuantity: number;
}

interface ExtraItem {
    barcode: string;
    product?: Product;
    stockItemId?: number; // if sk- barcode
    count: number;
    expirationDate?: string; // YYYY-MM-DD for input
}

interface ProcessingItem {
    barcode: string;
    status: string;
    productName?: string;
    error?: string;
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
    processingItems: ProcessingItem[] = [];

    isLoading = false;
    auditFinished = false;

    missingItemsResult: AuditItem[] = []; // For summary

    // View helper
    selectedLocationIdAsInput: number | null = null;

    // Hardware Scanner
    hardwareScanners: Kiosk[] = [];
    claimedScannerBy: string | null = null;
    claimedKioskId: number | null = null;
    private claimSub: Subscription | null = null;

    constructor(
        private locationService: LocationService,
        private scannerService: HardwareBarcodeScannerService,
        private http: HttpClient,
        private env: EnvironmentService,
        private productService: ProductListService,
        private tagsService: TagsService,
        private kioskService: KioskService
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
        this.processingItems = [];
    }

    ngOnInit(): void {
        this.loadLocations();
        // Register custom handler
        this.scannerService.setCustomHandler((barcode) => this.handleScan(barcode));

        // Load Scanners
        this.kioskService.getKiosks().subscribe(kiosks => {
            this.hardwareScanners = kiosks.filter(k =>
                (k.devices && k.devices.some(d => d.type === 'SCANNER' && d.status === 'ONLINE')) ||
                k.hasKeyboardScanner
            );
        });

        this.claimSub = this.scannerService.claimedBy$.subscribe(by => {
            this.claimedScannerBy = by;
        });

        const savedKioskId = localStorage.getItem('claimed_kiosk_id');
        if (savedKioskId) {
            this.claimedKioskId = parseInt(savedKioskId);
        }
    }

    claimScanner(kiosk: Kiosk) {
        this.scannerService.claimScanner(kiosk.id);
        this.claimedKioskId = kiosk.id;
        localStorage.setItem('claimed_kiosk_id', kiosk.id.toString());
    }

    ngOnDestroy(): void {
        // Clear custom handler
        this.scannerService.setCustomHandler(null);
        if (this.claimSub) this.claimSub.unsubscribe();
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
                // Group by Product ID
                const map = new Map<number, StockItem[]>();
                for (const item of loc.stockItems) {
                    if (item.productId) {
                        const list = map.get(item.productId) || [];
                        list.push(item);
                        map.set(item.productId, list);
                    }
                }

                // Create Audit Items from Groups
                for (const [pid, items] of map.entries()) {
                    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
                    const productName = items[0].product?.title || 'Unknown Product';

                    this.expectedItems.push({
                        stockItems: items,
                        found: false,
                        productName: productName,
                        reportedQuantity: totalQty,
                        initialQuantity: totalQty,
                        scannedCount: 0
                    });
                }
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
                // alert(`Unknown barcode: ${barcode}`);
                this.handleUnknownBarcode(barcode);
            }
        } catch (err) {
            console.error(err);
        }
    }

    processStockIdScan(stockId: number, barcode: string) {
        // Check if expected
        const expectedIdx = this.expectedItems.findIndex(i => i.stockItems.some(s => s.id === stockId));
        if (expectedIdx >= 0) {
            const item = this.expectedItems[expectedIdx];
            item.scannedCount++;
            item.found = item.scannedCount >= item.reportedQuantity;
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
        const candidateIdx = this.expectedItems.findIndex(i => i.stockItems[0].productId === product.id && !i.found);

        if (candidateIdx >= 0) {
            // Found expected item
            const item = this.expectedItems[candidateIdx];
            item.scannedCount++;

            // Check if fully found
            if (item.scannedCount >= item.reportedQuantity) {
                item.found = true;
            }
        } else {
            // Look for fully found items (overflow)
            const fullIdx = this.expectedItems.findIndex(i => i.stockItems[0].productId === product.id && i.found);
            if (fullIdx >= 0) {
                // Already fully found, add as extra
                this.addExtraAsNew(barcode, product);
                return;
            }

            // Extra item (totally new product)
            this.addExtraAsNew(barcode, product);
        }
    }

    addExtraAsNew(barcode: string, product: Product) {
        const existing = this.extraItems.find(e => e.product?.id === product.id);
        if (existing) {
            existing.count++;
        } else {
            // Calculate Default Expiration
            let expirationDate = '';
            const days = product.refrigeratorLifespanDays || product.pantryLifespanDays || 365;
            const d = new Date();
            d.setDate(d.getDate() + days);
            expirationDate = d.toISOString().split('T')[0];

            this.addExtraItem(barcode, product, undefined, expirationDate);
        }
    }

    addExtraItem(barcode: string, product?: Product, stockItemId?: number, expirationDate?: string) {
        this.extraItems.push({
            barcode,
            product,
            stockItemId,
            count: 1,
            expirationDate
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

        if (extra.stockItemId) {
            // It's an existing stock item. Update it.
            const payload: any = {
                locationId: this.selectedLocationId,
                quantity: extra.count
            };
            if (extra.expirationDate) {
                payload.expirationDate = new Date(extra.expirationDate);
            }

            try {
                await firstValueFrom(this.http.patch(`${this.env.apiUrl}/stock-items/${extra.stockItemId}`, payload));
                alert(`Updated item in this location.`);
            } catch (e) {
                console.error(e);
                alert("Failed to update item");
            }

        } else if (extra.product) {
            // Create New
            await this.createStockItem(extra.product.id, this.selectedLocationId, extra.count, extra.expirationDate);
            alert(`Created new stock entry for ${extra.product.title} in this location.`);
        }

        // Remove from list
        const idx = this.extraItems.indexOf(extra);
        if (idx >= 0) {
            this.extraItems.splice(idx, 1);
        }
    }

    async updateStockLocation(stockId: number, locationId: number) {
        await firstValueFrom(this.http.patch(`${this.env.apiUrl}/stock-items/${stockId}`, {
            locationId: locationId
        }));
    }

    async createStockItem(productId: number, locationId: number, quantity: number = 1, expirationDate?: string) {
        let expDateObj = null;
        if (expirationDate) {
            expDateObj = new Date(expirationDate);
        }

        await firstValueFrom(this.http.post(`${this.env.apiUrl}/stock-items`, {
            productId,
            locationId,
            quantity: quantity,
            expirationDate: expDateObj
        }));
    }

    async updateItemQuantity(item: AuditItem) {
        if (!item || item.reportedQuantity < 0) return;

        // If simple 1-to-1 mapping (most common)
        if (item.stockItems.length === 1) {
            try {
                await firstValueFrom(this.http.patch(`${this.env.apiUrl}/stock-items/${item.stockItems[0].id}`, {
                    quantity: item.reportedQuantity
                }));
                item.stockItems[0].quantity = item.reportedQuantity;
                item.initialQuantity = item.reportedQuantity;
                if (!item.found) item.found = true;
            } catch (e) {
                console.error("Failed to update quantity", e);
                alert("Failed to save quantity");
            }
        } else {
            // Complex case: Multiple stock items for this product.
            // We need to reconcile the total.
            // Simplest strategy: Update the first one to reflect the delta, or ask user?
            // "Grouping" usually implies treating them as fungible.
            // Strategy: 
            // 1. Calculate current total DB quantity.
            // 2. Diff with new reported quantity.
            // 3. Add/Subtract from first item (if enough) or iteratively.

            // For now, let's warn.
            alert("Cannot auto-update quantity for grouped items. Please adjust individual stock items in the inventory view if needed (Feature pending).");
            // Reset UI to initial
            item.reportedQuantity = item.initialQuantity;
        }
    }
    async handleUnknownBarcode(barcode: string) {
        // Check for existing processing item
        const existingProcess = this.processingItems.find(p => p.barcode === barcode);
        if (existingProcess) {
            existingProcess.count++;
            return;
        }

        const processItem: ProcessingItem = {
            barcode,
            status: 'Looking up...',
            count: 1
        };
        this.processingItems.push(processItem);

        try {
            // OFF Lookup
            let offData: any = {};
            try {
                const offRes = await firstValueFrom(this.http.get<any>(`https://world.openfoodfacts.org/api/v2/product/${barcode}`));
                if (offRes && offRes.product) {
                    offData = offRes.product;
                }
            } catch (e) { }

            if (!offData.product_name) {
                processItem.status = 'Not found in OFF';
                processItem.error = 'Unknown Product';
                // Wait and remove?
                setTimeout(() => {
                    const idx = this.processingItems.indexOf(processItem);
                    if (idx >= 0) this.processingItems.splice(idx, 1);
                }, 3000);
                return;
            }

            processItem.status = 'AI Processing...';

            // Match Check
            const matchRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/product-match`, {
                productName: offData.product_name,
                brand: offData.brands || ""
            }));

            let product: Product;

            if (matchRes.matchId) {
                // Link to existing
                processItem.status = 'Linking...';
                product = await firstValueFrom(this.productService.Get(matchRes.matchId));

                // Add barcode if missing
                const updatedBarcodes = product.barcodes || [];
                if (!updatedBarcodes.find(b => b.barcode === barcode)) {
                    updatedBarcodes.push({
                        barcode: barcode,
                        brand: offData.brands || "",
                        description: "Added via Audit",
                        tags: [],
                        ProductId: product.id,
                        id: 0,
                        quantity: 1
                    });
                    await firstValueFrom(this.productService.Update({ ...product, barcodes: updatedBarcodes }));
                }
            } else {
                // Create New
                processItem.status = 'Creating Product...';
                const detailsRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/barcode-details`, {
                    productName: offData.product_name,
                    brand: offData.brands || "",
                    existingProductTitle: ""
                }));
                const details = detailsRes.data;
                const candidateTitle = details.title || offData.product_name;

                // Tags Logic
                const allTags = await firstValueFrom(this.tagsService.GetAll());
                const productTags: ProductTags[] = [];
                if (details.tags && Array.isArray(details.tags)) {
                    for (const tagName of details.tags) {
                        const existing = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                        if (existing) {
                            productTags.push(existing);
                        } else {
                            try {
                                const newTag = await firstValueFrom(this.tagsService.Create({ name: tagName, group: 'General' } as any));
                                productTags.push(newTag);
                            } catch (e) { }
                        }
                    }
                }

                const newProductPayload: any = {
                    title: candidateTitle,
                    tags: productTags,
                    barcodes: [{
                        barcode: barcode,
                        brand: details.brand || offData.brands || "",
                        description: details.description || "",
                        tags: [],
                        quantity: 1
                    }],
                    refrigeratorLifespanDays: details.refrigeratorLifespanDays,
                    pantryLifespanDays: details.pantryLifespanDays,
                    trackCountBy: details.trackCountBy || 'quantity',
                };
                product = await firstValueFrom(this.productService.Create(newProductPayload));
            }

            // Create Stock Item
            processItem.status = 'Adding Stock...';
            // Calculate Default Expiration
            let expirationDateObj: Date | null = null;
            const days = product.refrigeratorLifespanDays || product.pantryLifespanDays || 365;
            const d = new Date();
            d.setDate(d.getDate() + days);
            expirationDateObj = d;

            let createdStockItem: any = null;
            if (this.selectedLocationId) {
                createdStockItem = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/stock-items`, {
                    productId: product.id,
                    locationId: this.selectedLocationId,
                    quantity: processItem.count,
                    expirationDate: expirationDateObj
                }));
            }

            // Success
            processItem.status = 'Done';
            processItem.productName = product.title;

            // Move to Extra Items (so it shows up in the accepted list)
            const isoDate = expirationDateObj ? expirationDateObj.toISOString().split('T')[0] : undefined;

            // Check if already in extras (from a manual scan parallel to this flow?)
            const existingExtra = this.extraItems.find(e => e.product?.id === product.id);
            if (existingExtra) {
                existingExtra.count += processItem.count;
                if (!existingExtra.stockItemId && createdStockItem) {
                    existingExtra.stockItemId = createdStockItem.id;
                }
            } else {
                this.extraItems.push({
                    barcode,
                    product,
                    count: processItem.count,
                    stockItemId: createdStockItem?.id,
                    expirationDate: isoDate
                });
            }

            // Remove from processing
            const idx = this.processingItems.indexOf(processItem);
            if (idx >= 0) {
                this.processingItems.splice(idx, 1);
            }

        } catch (err) {
            console.error(err);
            processItem.status = 'Error';
            processItem.error = 'Failed';
        }
    }
}
