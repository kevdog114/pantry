import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { LabelService } from '../services/label.service';
import { KioskService } from '../services/kiosk.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { ProductListService } from '../components/product-list/product-list.service';
import { TagsService } from '../tags.service';
import { Product, ProductTags } from '../types/product';
import { firstValueFrom } from 'rxjs';

type ViewState = 'MAIN' | 'UTILITIES' | 'PRINT_LABELS';

@Component({
    selector: 'app-kiosk-page',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatSnackBarModule
    ],
    templateUrl: './kiosk-page.component.html',
    styleUrls: ['./kiosk-page.component.css']
})
export class KioskPageComponent implements OnInit, OnDestroy {
    // Status Section
    status: string = 'Ready';
    statusSubtext: string = '';
    activeMode: 'NONE' | 'RESTOCK' | 'CONSUME' = 'NONE';

    // View State
    viewState: ViewState = 'MAIN';

    // Info Footer
    pantryName = 'Kevin\'s Pantry'; // Hardcoded for now or fetch from config?
    currentDate: Date = new Date();
    private timer: any;

    // Printer logic
    labelSizeCode: string = 'continuous';

    constructor(
        private router: Router,
        private labelService: LabelService,
        private kioskService: KioskService,
        private snackBar: MatSnackBar,
        private env: EnvironmentService,
        private hardwareScanner: HardwareBarcodeScannerService,
        private http: HttpClient,

        private productService: ProductListService,
        private tagsService: TagsService
    ) { }

    ngOnInit(): void {
        this.pantryName = this.env.siteName;

        // Timer for date update
        this.timer = setInterval(() => {
            this.currentDate = new Date();
        }, 60000);

        // Detect printer (reused logic)
        this.detectPrinterMedia();

        // BLOCK default barcode behavior by default on this page
        this.hardwareScanner.setCustomHandler(() => {
            // Do nothing if scanned in main menu
        });
    }

    ngOnDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        this.hardwareScanner.setCustomHandler(null);
    }

    detectPrinterMedia() {
        this.kioskService.getKiosks().subscribe(kiosks => {
            let found = false;
            for (const kiosk of kiosks) {
                if (kiosk.devices) {
                    const printer = kiosk.devices.find(d => d.type === 'PRINTER' && (d.status === 'ONLINE' || d.status === 'READY'));
                    if (printer && printer.details) {
                        try {
                            const details = typeof printer.details === 'string' ? JSON.parse(printer.details) : printer.details;
                            if (details.detected_label) {
                                const w = details.detected_label.width;
                                if (w >= 50) {
                                    this.labelSizeCode = 'continuous';
                                } else if (w > 0 && w < 30) {
                                    this.labelSizeCode = '23mm';
                                } else {
                                    this.labelSizeCode = details.media || 'continuous';
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

    // Actions
    setMode(mode: 'RESTOCK' | 'CONSUME') {
        this.activeMode = mode;
        this.status = 'Scan Barcode...';
        this.statusSubtext = '';

        if (mode === 'RESTOCK') {
            this.hardwareScanner.setCustomHandler(this.handleRestockBarcode.bind(this));
        } else {
            this.hardwareScanner.setCustomHandler(this.handleConsumeBarcode.bind(this));
        }
    }

    finishAction() {
        this.activeMode = 'NONE';
        this.status = 'Ready';
        this.statusSubtext = '';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    async handleRestockBarcode(barcode: string) {
        if (!barcode) return;
        this.status = "Looking up product...";

        try {
            // 1. Check Local DB
            let product: Product | null = null;
            try {
                product = await firstValueFrom(this.http.get<Product>(this.env.apiUrl + "/barcodes/products?barcode=" + barcode));
            } catch (e) { product = null; }

            if (product) {
                await this.addStock(product, 1);
                this.status = "1 Unit Added";
                this.statusSubtext = product.title;
                this.showTempStatus("1 Unit Added", product.title, 3000);
            } else {
                // 2. Not Found - External Lookup flow
                await this.handleNewProduct(barcode);
            }
        } catch (err) {
            console.error("Scan Error", err);
            this.status = "Error processing scan.";
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async handleConsumeBarcode(barcode: string) {
        if (!barcode) return;
        this.status = "Looking up product...";

        try {
            // 1. Check Local DB
            let product: Product | null = null;
            try {
                // Using searchProductByBarcode logic endpoint
                product = await firstValueFrom(this.http.get<Product>(this.env.apiUrl + "/barcodes/products?barcode=" + barcode));
            } catch (e) { product = null; }

            if (product) {
                // Find stock item
                if (product.stockItems && product.stockItems.length > 0) {
                    // Pick the best one - e.g. oldest opened, or oldest expiration, or just first
                    // Sorting: Opened first, then oldest exp date
                    const sorted = product.stockItems.sort((a, b) => {
                        if (a.opened && !b.opened) return -1;
                        if (!a.opened && b.opened) return 1;
                        const da = a.expirationDate ? new Date(a.expirationDate).getTime() : 0;
                        const db = b.expirationDate ? new Date(b.expirationDate).getTime() : 0;
                        return da - db;
                    });

                    const item = sorted[0];

                    if (item.id) {
                        if (item.quantity > 1) {
                            // Decrement
                            await firstValueFrom(this.productService.UpdateStock(item.id, {
                                ...item,
                                quantity: item.quantity - 1
                            }));
                        } else {
                            // Delete
                            await firstValueFrom(this.productService.DeleteStock(item.id));
                        }
                        this.status = "1 Unit Consumed";
                        this.statusSubtext = product.title;
                        this.showTempStatus("1 Unit Consumed", product.title, 3000);
                    }
                } else {
                    this.status = "Out of Stock";
                    this.statusSubtext = product.title;
                    this.showTempStatus("Out of Stock", product.title, 3000);
                }

            } else {
                this.status = "Product Not Found";
                this.statusSubtext = "Try adding it in Restock";
                this.showTempStatus("Product Not Found", "Try adding it in Restock", 3000);
            }
        } catch (err) {
            console.error("Scan Error", err);
            this.status = "Error processing scan.";
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async handleNewProduct(barcode: string) {
        this.status = "Checking external sources...";

        // OFF Lookup
        let offData: any = {};
        try {
            const offRes = await firstValueFrom(this.http.get<any>("https://world.openfoodfacts.org/api/v2/product/" + barcode));
            if (offRes && offRes.product) {
                offData = offRes.product;
            }
        } catch (e) { console.warn("OFF lookup failed"); }

        this.status = "Consulting AI...";

        // Gemini Match Check
        try {
            const matchRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/product-match`, {
                productName: offData.product_name || "Unknown Product",
                brand: offData.brands || ""
            }));

            if (matchRes.matchId) {
                // LINK to existing
                const existingProduct = await firstValueFrom(this.productService.Get(matchRes.matchId));

                // Add barcode to product
                const updatedBarcodes = existingProduct.barcodes || [];
                updatedBarcodes.push({
                    barcode: barcode,
                    brand: offData.brands || "",
                    description: "Added via Kiosk",
                    tags: [], // Could imply tags but keeping simple
                    ProductId: existingProduct.id,
                    id: 0, // 0 for new
                    quantity: 1
                });

                // We need to update product to save barcode
                // But ProductService.Update expects strict structure. 
                // Let's assume sending the modified product works or we need a specialized endpoint?
                // ProductView/MissingBarcode does this via Update.
                const updatePayload = {
                    ...existingProduct,
                    barcodes: updatedBarcodes
                };

                await firstValueFrom(this.productService.Update(updatePayload));
                await this.addStock(existingProduct, 1);

                this.status = "Linked & Added";
                this.statusSubtext = existingProduct.title;
                this.showTempStatus("Linked & Added", existingProduct.title, 3000);
            } else {
                // CREATE NEW
                this.status = "Analyzing product details...";
                const detailsRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/barcode-details`, {
                    productName: offData.product_name || "Unknown Product",
                    brand: offData.brands || "",
                    existingProductTitle: ""
                }));
                // { data: { title, brand, description, tags, pantryLifespanDays... }, warning }
                const details = detailsRes.data;

                // Resolve Tags
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
                            } catch (e) { console.warn("Tag create failed", e); }
                        }
                    }
                }

                // Create Product
                const newProductPayload: any = {
                    title: details.title || offData.product_name || "New Product",
                    tags: productTags,
                    barcodes: [{
                        barcode: barcode,
                        brand: details.brand || offData.brands || "",
                        description: details.description || "",
                        tags: [],
                        quantity: 1
                    }],
                    refrigeratorLifespanDays: details.refrigeratorLifespanDays,
                    freezerLifespanDays: details.freezerLifespanDays,
                    openedLifespanDays: details.openedLifespanDays,
                    // If pantry lifespan is provided, maybe track it? Field not in standard Product interface shown?
                    // Assuming standard fields.
                };

                const createdProduct = await firstValueFrom(this.productService.Create(newProductPayload));

                this.status = `Adding new product with 1 unit...`;
                await this.addStock(createdProduct, 1);

                this.status = "Created & Added";
                this.statusSubtext = createdProduct.title;
                this.showTempStatus("Created & Added", createdProduct.title, 3000);
            }
        } catch (e) {
            console.error("AI/Create failed", e);
            this.status = "Failed to process product.";
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async addStock(product: Product, quantity: number) {
        // Create stock item
        const today = new Date();
        // Default expiration?
        let expDate = new Date();
        expDate.setDate(today.getDate() + 365); // Default 1 year if unknown

        // If product has lifespan, use it?
        // Logic normally calculates this. 
        // For now, let's use a safe default or backend logic might handle null?
        // StockItem requires expirationDate.

        await firstValueFrom(this.productService.CreateStock({
            productId: product.id,
            quantity: quantity,
            expirationDate: expDate,
            productBarcodeId: product.barcodes?.[0]?.id || 0, // Associate with first barcode?
            opened: false,
            frozen: false,
            expirationExtensionAfterThaw: 0
        }));
    }

    showTempStatus(msg: string, subtext: string, duration: number) {
        // If we want to show the specific message for duration
        // logic below was just resetting. 
        // We set the status immediately before calling this.

        setTimeout(() => {
            if (this.activeMode === 'RESTOCK' || this.activeMode === 'CONSUME') {
                this.status = "Scan Barcode...";
                this.statusSubtext = "";
            }
        }, duration);
    }

    goToMealPlan() {
        this.router.navigate(['/meal-plan']);
    }

    openUtilities() {
        this.viewState = 'UTILITIES';
        this.status = 'Utilities';
        this.statusSubtext = '';
        this.activeMode = 'NONE';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    closeUtilities() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
        this.statusSubtext = '';
        this.activeMode = 'NONE';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    openPrintLabels() {
        this.viewState = 'PRINT_LABELS';
        this.status = 'Print Labels';
    }

    printLabel(type: 'Opened' | 'Expires', daysFromNow: number) {
        const date = new Date();
        date.setDate(date.getDate() + daysFromNow);

        this.labelService.printQuickLabel(type, date, this.labelSizeCode).subscribe({
            next: () => {
                this.snackBar.open('Label printed', 'Close', { duration: 2000 });
            },
            error: (err) => {
                console.error('Print failed', err);
                this.snackBar.open('Failed to print', 'Close', { duration: 2000 });
            }
        });
    }

    scaleAction() {
        // Non-functional
        this.snackBar.open('Scale implementation pending', 'Close', { duration: 1000 });
    }

    printShoppingList() {
        this.snackBar.open('Printing shopping list... (Not implemented)', 'Close', { duration: 2000 });
    }

    exitKiosk() {
        this.router.navigate(['/']);
    }
}
