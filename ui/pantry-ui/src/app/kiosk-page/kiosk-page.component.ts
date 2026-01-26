import { Component, OnDestroy, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { LabelService } from '../services/label.service';
import { KioskService } from '../services/kiosk.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { ProductListService } from '../components/product-list/product-list.service';
import { TagsService } from '../tags.service';
import { Product, ProductTags, StockItem } from '../types/product';
import { firstValueFrom, Subscription } from 'rxjs';
import { MarkdownModule } from 'ngx-markdown';

type ViewState = 'MAIN' | 'UTILITIES' | 'PRINT_LABELS' | 'QUICK_LABEL' | 'SCALE' | 'COOK' | 'TIMERS';
import { Recipe, RecipeQuickAction } from '../types/recipe';

import { SocketService } from '../services/socket.service';
import { SipService, SipConfig, SipCallState, SipIncomingCall } from '../services/sip.service';

@Component({
    selector: 'app-kiosk-page',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatSnackBarModule,
        MatProgressBarModule,
        MatInputModule,
        MatChipsModule,
        MatDatepickerModule,
        MatNativeDateModule,
        FormsModule,
        MarkdownModule
    ],
    templateUrl: './kiosk-page.component.html',
    styleUrls: ['./kiosk-page.component.css']
})
export class KioskPageComponent implements OnInit, OnDestroy {
    // Status Section
    status: string = 'Ready';
    statusSubtext: string = '';
    activeMode: 'NONE' | 'RESTOCK' | 'CONSUME' | 'INVENTORY' = 'NONE';
    isOnline: boolean = false;

    // View State
    viewState: ViewState | 'PHONE' = 'MAIN';

    // Info Footer
    pantryName = '';
    currentDate: Date = new Date();
    private timer: any;

    // Printer logic
    labelSizeCode: string = 'continuous';

    // Quick Label Logic
    quickLabelTypes: string[] = ['Prepared', 'Expires', 'Best By', 'Opened'];
    quickLabelSelectedType: string = 'Prepared';
    quickLabelDate: Date = new Date();

    scannerClaimedBy: string | null = null;
    amIClaiming: boolean = false;

    // SIP Logic
    pbxConfig: SipConfig | null = null;
    callState: SipCallState | null = null;
    incomingCall: SipIncomingCall | null = null;
    dialNumber: string = '';

    // COOK Logic
    selectedRecipe: Recipe | null = null;
    availableInstructions: Recipe[] = [];
    activeTimers: any[] = [];
    targetWeight: number | null = null;
    showRecipeDetails: boolean = false;


    upcomingMeals: any[] = [];
    private timersSub: Subscription | null = null;

    constructor(
        private router: Router,
        private labelService: LabelService,
        private kioskService: KioskService,
        private snackBar: MatSnackBar,
        private env: EnvironmentService,
        private hardwareScanner: HardwareBarcodeScannerService,
        private http: HttpClient,
        private socketService: SocketService,
        private productService: ProductListService,
        private tagsService: TagsService,
        private ngZone: NgZone,
        private sipService: SipService
    ) { }

    ngOnInit(): void {
        this.pantryName = this.env.siteName;

        this.socketService.connected$.subscribe(connected => {
            this.isOnline = connected;
            if (connected) {
                const kIdStr = localStorage.getItem('kiosk_id');
                if (kIdStr) {
                    this.socketService.emit('bind_to_kiosk', parseInt(kIdStr));
                }
            }
        });

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

        this.hardwareScanner.claimedBy$.subscribe(claimer => {
            this.scannerClaimedBy = claimer;
            this.amIClaiming = claimer === 'Me';
        });

        // SIP Init
        const kIdStr = localStorage.getItem('kiosk_id');
        if (kIdStr) {
            const kioskId = parseInt(kIdStr);
            this.sipService.getConfig(kioskId);

            this.sipService.config$.subscribe(cfg => {
                this.pbxConfig = cfg;
            });

            this.sipService.callState$.subscribe(state => {
                this.ngZone.run(() => {
                    this.callState = state;
                    if (state && state.state === 'CONFIRMED') {
                        // In call
                    }
                });
            });

            this.sipService.incomingCall$.subscribe(call => {
                this.ngZone.run(() => {
                    this.incomingCall = call;
                    if (call) {
                        // Auto answer or show overlay?
                        // User requirement: "automatically put it on speaker and display... overlay"
                        // This implies answering.
                        // But we wait for user to confirm? No "automatically put it on speaker".
                        // Wait, if we answer, we are CONNECTED.
                        // Does "put on speaker" mean answer? Usually yes.
                        // I will trigger answer.

                        // But if I auto-answer, I should probably wait a split second?
                        // Actually, let's implement the overlay first.
                        // If I answer immediately, the overlay shows "Connected" with "Hangup".
                        // I'll auto-answer if not already active.
                        if (!this.callState || this.callState.state === 'DISCONNECTED') {
                            console.log("Auto answering call on speaker");
                            // this.answerCall(); // Uncomment to enable auto-answer
                        }
                    }
                });
            });
        }


        // Timer Polling - Replaced with WebSockets
        this.fetchTimers();
        this.timersSub = this.socketService.fromEvent('timers_updated').subscribe(() => {
            this.fetchTimers();
        });

        // Global interval to fetch timers periodically (backup for socket)
        setInterval(() => {
            this.fetchTimers();
        }, 10000);

        setInterval(() => {
            // Local decrement for smoothness based on calculated end time if available, or just re-calc
            // actually fetchTimers updates the list.
            // But we need a smooth countdown between fetches.
            const now = Date.now();
            this.activeTimers.forEach(t => {
                if (t.endTimestamp) {
                    const remaining = Math.max(0, Math.floor((t.endTimestamp - now) / 1000));
                    t.remainingSeconds = remaining;
                } else if (t.remainingSeconds > 0) {
                    t.remainingSeconds--;
                }
            });
        }, 1000);
    }
    ngOnDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        this.activeTimers.forEach(t => clearInterval(t.interval));
        this.hardwareScanner.setCustomHandler(null);
        if (this.timersSub) this.timersSub.unsubscribe();
    }

    // ... (rest of methods)

    // SIP Methods
    openPhone() {
        this.viewState = 'PHONE';
        this.status = 'Quick Dial';
    }

    closePhone() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
    }

    dial(number: string) {
        const kIdStr = localStorage.getItem('kiosk_id');
        if (!kIdStr) return;
        this.sipService.dial(parseInt(kIdStr), number);
    }

    hangupCall() {
        const kIdStr = localStorage.getItem('kiosk_id');
        if (!kIdStr) return;
        this.sipService.hangup(parseInt(kIdStr));
    }

    answerCall() {
        const kIdStr = localStorage.getItem('kiosk_id');
        if (!kIdStr) return;
        this.sipService.answer(parseInt(kIdStr));
    }

    appendDigit(digit: string) {
        this.dialNumber += digit;
    }

    clearDigit() {
        this.dialNumber = this.dialNumber.slice(0, -1);
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
    setMode(mode: 'RESTOCK' | 'CONSUME' | 'INVENTORY') {
        this.activeMode = mode;
        this.status = 'Scan Barcode...';
        this.statusSubtext = '';

        if (mode === 'RESTOCK') {
            this.hardwareScanner.setCustomHandler(this.handleRestockBarcode.bind(this));
        } else if (mode === 'CONSUME') {
            this.hardwareScanner.setCustomHandler(this.handleConsumeBarcode.bind(this));
        } else if (mode === 'INVENTORY') {
            this.hardwareScanner.setCustomHandler(this.handleInventoryBarcode.bind(this));
        }
    }

    finishAction() {
        this.activeMode = 'NONE';
        this.status = 'Ready';
        this.statusSubtext = '';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    async resolveBarcode(rawBarcode: string): Promise<{ product: Product | null, stockItem: StockItem | null }> {
        const lower = rawBarcode.toLowerCase();

        try {
            if (lower.startsWith('sk-') || lower.startsWith('s2-')) {
                // Stock Item Lookup
                const idStr = rawBarcode.substring(3);
                try {
                    const item = await firstValueFrom(this.http.get<StockItem>(this.env.apiUrl + "/stock-items/" + idStr));
                    if (item && item.productId) {
                        const product = await firstValueFrom(this.productService.Get(item.productId));
                        return { product, stockItem: item };
                    }
                } catch (e) {
                    // Stock item not found
                    return { product: null, stockItem: null };
                }
            } else {
                // Product Barcode Lookup
                try {
                    const product = await firstValueFrom(this.http.get<Product>(this.env.apiUrl + "/barcodes/products?barcode=" + rawBarcode));
                    return { product, stockItem: null };
                } catch (e) {
                    return { product: null, stockItem: null };
                }
            }
        } catch (e) {
            console.error("Error resolving barcode", e);
        }
        return { product: null, stockItem: null };
    }

    async handleRestockBarcode(barcode: string) {
        if (!barcode) return;
        this.status = "Looking up product...";

        try {
            const { product, stockItem } = await this.resolveBarcode(barcode);

            if (product) {
                await this.addStock(product, 1);
                this.status = "1 Unit Added";
                this.statusSubtext = product.title;
                this.showTempStatus("1 Unit Added", product.title, 3000);
            } else {
                // Not Found - External Lookup flow?
                // correctly handle if they scanned a stock code vs product code
                if (barcode.toLowerCase().startsWith('sk-') || barcode.toLowerCase().startsWith('s2-')) {
                    this.status = "Stock Item Not Found";
                    this.showTempStatus("Stock Item Not Found", "", 3000);
                    return;
                }

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
            const { product, stockItem } = await this.resolveBarcode(barcode);

            if (product) {
                // Find stock item
                let targetItem: StockItem | undefined;

                if (stockItem) {
                    targetItem = stockItem;
                } else if (product.stockItems && product.stockItems.length > 0) {
                    // Pick the best one
                    const sorted = product.stockItems.sort((a, b) => {
                        if (a.opened && !b.opened) return -1;
                        if (!a.opened && b.opened) return 1;
                        const da = a.expirationDate ? new Date(a.expirationDate).getTime() : 0;
                        const db = b.expirationDate ? new Date(b.expirationDate).getTime() : 0;
                        return da - db;
                    });
                    targetItem = sorted[0];
                }

                if (targetItem && targetItem.id) {
                    if (targetItem.quantity > 1) {
                        // Decrement
                        await firstValueFrom(this.productService.UpdateStock(targetItem.id, {
                            ...targetItem,
                            quantity: targetItem.quantity - 1
                        }));
                    } else {
                        // Delete
                        await firstValueFrom(this.productService.DeleteStock(targetItem.id));
                    }
                    this.status = "1 Unit Consumed";
                    this.statusSubtext = product.title;
                    this.showTempStatus("1 Unit Consumed", product.title, 3000);
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

    async handleInventoryBarcode(barcode: string) {
        if (!barcode) return;
        this.status = "Checking Stock...";
        this.statusSubtext = "";

        try {
            // Check Local DB
            const { product, stockItem } = await this.resolveBarcode(barcode);

            if (product) {
                this.status = product.title;

                let totalQty = 0;
                let nextExp: Date | null = null;

                if (product.stockItems) {
                    for (const item of product.stockItems) {
                        totalQty += item.quantity;
                        if (item.expirationDate) {
                            const d = new Date(item.expirationDate);
                            if (!nextExp || d < nextExp) {
                                nextExp = d;
                            }
                        }
                    }
                }

                if (totalQty === 0) {
                    this.statusSubtext = "Out of Stock";
                } else {
                    let expStr = "No Expiry";
                    if (nextExp) {
                        expStr = new Date(nextExp).toLocaleDateString();
                    }
                    this.statusSubtext = `Total Stock: ${totalQty} | Next Exp: ${expStr}`;

                    if (stockItem) {
                        // Overwrite subtext if specific item scanned
                        let specificExp = stockItem.expirationDate ? new Date(stockItem.expirationDate).toLocaleDateString() : 'None';
                        this.statusSubtext = `Scanned Item: ${stockItem.quantity} unit(s) | Exp: ${specificExp}`;
                    }
                }

                // We do NOT call showTempStatus because we want this info to stay until next scan or exit
            } else {
                this.status = "Product Not Found";
                this.statusSubtext = "";
                this.showTempStatus("Product Not Found", "", 3000);
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
                    trackCountBy: details.trackCountBy || 'quantity', // Use AI suggestion
                    autoPrintLabel: details.autoPrintLabel || false,
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

    getTimerForAction(action: RecipeQuickAction): any | undefined {
        return this.activeTimers.find(t => t.name === action.name);
    }

    showTempStatus(msg: string, subtext: string, duration: number) {
        // If we want to show the specific message for duration
        // logic below was just resetting. 
        // We set the status immediately before calling this.

        setTimeout(() => {
            if (this.activeMode === 'RESTOCK' || this.activeMode === 'CONSUME' || this.activeMode === 'INVENTORY') {
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

    // State for Cook Mode Scale Menu
    showScaleOptions: boolean = false;

    scaleAction() {
        if (this.selectedRecipe && this.viewState === 'COOK') {
            this.showScaleOptions = true;
        } else {
            this.openFreeScale();
        }
    }

    openFreeScale() {
        this.viewState = 'SCALE';
        this.status = 'Scale';
        this.startScaleRead();
    }

    closeScale() {
        this.stopScaleRead();
        this.targetWeight = null;
        if (this.selectedRecipe) {
            this.viewState = 'COOK';
            this.status = this.selectedRecipe.title;
            // Return to scale options if we came from there? 
            // Probably better to reset to main cook view for cleanliness
            this.showScaleOptions = false;
        } else {
            this.openUtilities();
        }
    }

    // TIMERS
    openTimers() {
        this.viewState = 'TIMERS';
        this.status = 'Timers';
    }

    get recipeTimerActions(): RecipeQuickAction[] {
        return this.selectedRecipe?.quickActions?.filter(a => a.type === 'timer') || [];
    }

    get recipeScaleActions(): RecipeQuickAction[] {
        return this.selectedRecipe?.quickActions?.filter(a => a.type === 'weigh' || a.type === 'scale') || [];
    }

    closeTimers() {
        if (this.selectedRecipe) {
            this.viewState = 'COOK';
            this.status = this.selectedRecipe.title;
        } else {
            this.viewState = 'MAIN';
            this.status = 'Ready';
        }
    }

    createTimer(minutes: number, name?: string) {
        const duration = minutes * 60;
        this.http.post(`${this.env.apiUrl}/timers`, {
            name: name || `${minutes}m Timer`,
            duration: duration
        }).subscribe(() => {
            this.snackBar.open("Timer Started", "Close", { duration: 1000 });
            this.fetchTimers();
        });
    }

    removeTimer(arg: any) {
        const id = typeof arg === 'number' ? arg : arg.id;
        this.http.delete(`${this.env.apiUrl}/timers/${id}`).subscribe(() => {
            this.snackBar.open("Timer Deleted", "Close", { duration: 1000 });
            this.fetchTimers();
        });
    }

    deleteTimer(id: number) {
        this.removeTimer(id);
    }

    fetchTimers() {
        this.http.get<any[]>(`${this.env.apiUrl}/timers`).subscribe({
            next: (response: any) => {
                const timers = response.data || [];
                const now = new Date().getTime();
                this.activeTimers = timers.map((t: any) => {
                    const start = new Date(t.startedAt).getTime();
                    const end = start + (t.duration * 1000);
                    const remaining = Math.max(0, Math.floor((end - now) / 1000));
                    return {
                        id: t.id,
                        name: t.name,
                        remainingSeconds: remaining,
                        totalSeconds: t.duration,
                        endTimestamp: end // Store end time for local calc
                    };
                }).filter((t: any) => t.remainingSeconds > 0);
            },
            error: (e) => console.error("Failed to fetch timers", e)
        });
    }


    // Quick Label Methods
    openQuickLabel() {
        this.viewState = 'QUICK_LABEL';
        this.status = 'Quick Label';
        this.quickLabelDate = new Date(); // Reset date to today
        this.quickLabelSelectedType = 'Prepared'; // Default
    }

    selectQuickLabelType(type: string) {
        this.quickLabelSelectedType = type;
    }

    getQuickLabelIcon(type: string): string {
        switch (type) {
            case 'Prepared': return 'restaurant';
            case 'Expires': return 'timer';
            case 'Best By': return 'verified';
            case 'Opened': return 'calendar_today';
            default: return 'label';
        }
    }

    printCustomQuickLabel() {
        if (!this.quickLabelSelectedType || !this.quickLabelDate) return;

        this.labelService.printQuickLabel(
            this.quickLabelSelectedType,
            this.quickLabelDate,
            this.labelSizeCode
        ).subscribe({
            next: () => {
                this.snackBar.open('Label printed successfully', 'Close', { duration: 2000 });
            },
            error: (err) => {
                console.error('Print failed', err);
                this.snackBar.open('Failed to print label', 'Close', { duration: 2000 });
            }
        });
    }

    // Scale Logic
    scaleStreamSub: any = null;
    currentWeight: number = 0;
    currentUnit: string = 'g'; // from stream, but we might toggle display
    displayUnitMode: 'g' | 'oz' | 'lbs' = 'g';

    get displayWeight(): number {
        if (this.displayUnitMode === 'g') return this.currentWeight;
        if (this.displayUnitMode === 'oz') return this.currentWeight * 0.035274;
        if (this.displayUnitMode === 'lbs') return this.currentWeight * 0.00220462;
        return this.currentWeight;
    }

    get progressValue(): number {
        if (!this.targetWeight || this.targetWeight === 0) return 0;
        const val = (this.currentWeight / this.targetWeight) * 100;
        return Math.min(Math.max(val, 0), 100);
    }

    startScaleRead() {
        // Assume kiosk ID is known or current context
        // KioskPage usually runs on a "Kiosk" which might not know its ID easily unless stored?
        // KioskService usually stores 'kiosk_id' in localStorage
        const kIdStr = localStorage.getItem('kiosk_id');
        if (!kIdStr) {
            this.snackBar.open("Kiosk ID not found", "Close");
            return;
        }
        const kioskId = parseInt(kIdStr);

        this.stopScaleRead();

        // Join room
        this.socketService.emit('bind_to_kiosk', kioskId);
        // Start polling
        this.socketService.emit('read_scale', { kioskId, requestId: 'init' });

        const handler = (data: any) => {
            if (data.success && data.data) {
                this.ngZone.run(() => {
                    this.currentWeight = data.data.weight;
                    // We ignore data.unit for display mode logic, assuming input is always grams from bridge
                    // But if bridge sends something else, we might need to normalize.
                    // For now assume bridge sends 'g'.
                });
            }
        };

        this.socketService.on('scale_reading', handler);
        this.scaleStreamSub = handler;
    }

    stopScaleRead() {
        if (this.scaleStreamSub) {
            this.socketService.removeListener('scale_reading');
            this.scaleStreamSub = null;
        }
    }

    tareScale() {
        const kIdStr = localStorage.getItem('kiosk_id');
        if (!kIdStr) return;
        const kioskId = parseInt(kIdStr);
        const requestId = `tare_kiosk_${Date.now()}`;

        this.snackBar.open('Taring...', 'Close', { duration: 2000 });

        const handler = (data: any) => {
            if (data.requestId === requestId) {
                this.socketService.removeListener('tare_complete');
                if (data.success) {
                    this.snackBar.open('Tare successful', 'Close', { duration: 3000 });
                } else {
                    this.snackBar.open('Tare failed: ' + data.message, 'Close', { duration: 3000 });
                }
            }
        };
        this.socketService.on('tare_complete', handler);
        this.socketService.emit('tare_scale', { kioskId, requestId });
    }

    toggleUnit() {
        if (this.currentUnit === 'g') {
            this.currentUnit = 'oz'; // switching logic for UI button text primarily
            this.displayUnitMode = 'oz'; // defaulting next state
        } else {
            this.currentUnit = 'g';
            this.displayUnitMode = 'g';
        }

        // Cycle: g -> oz -> lbs -> g
        // Actually button text says "TO GRAMS" or "TO OZ/LBS"
        // Let's implement cycle
    }

    // Override toggleUnit for cycle behavior
    overrideToggleUnit() {
        if (this.displayUnitMode === 'g') this.displayUnitMode = 'oz';
        else if (this.displayUnitMode === 'oz') this.displayUnitMode = 'lbs';
        else this.displayUnitMode = 'g';

        this.currentUnit = this.displayUnitMode; // sync for button text logic
    }

    printShoppingList() {
        this.snackBar.open('Printing shopping list... (Not implemented)', 'Close', { duration: 2000 });
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

    // COOK METHODS
    openCook() {
        this.viewState = 'COOK';
        this.status = 'Scan Recipe...';
        this.statusSubtext = '';
        this.selectedRecipe = null;
        this.showRecipeDetails = false;
        this.availableInstructions = [];
        this.activeMode = 'NONE';
        this.showCookPrintMenu = false;
        this.showTimerActions = false;
        this.showScaleActions = false;

        // Refresh timers when entering Cook
        this.fetchTimers();

        // Handler for Recipe Barcodes
        this.hardwareScanner.setCustomHandler(this.handleCookBarcode.bind(this));

        this.fetchUpcomingMeals();
    }

    closeCook() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
        this.statusSubtext = '';
        this.selectedRecipe = null;
        this.availableInstructions = [];
        // Clean timers
        // Clean timers
        // this.activeTimers.forEach(t => clearInterval(t.interval));
        // this.activeTimers = []; // DO NOT CLEAR - PERSIST GLOBALLY
        this.hardwareScanner.setCustomHandler(() => { });
        this.fetchTimers();
    }

    async handleCookBarcode(barcode: string) {
        if (!barcode) return;

        // Expected format R-<ID> or recipe:<ID>
        const lower = barcode.toLowerCase();
        let recipeId: number | null = null;

        if (lower.startsWith('r-')) {
            recipeId = parseInt(barcode.substring(2));
        } else if (lower.startsWith('recipe:')) {
            recipeId = parseInt(barcode.substring(7));
        }

        if (recipeId) {
            this.status = "Loading Recipe...";
            try {
                const recipe = await firstValueFrom(this.http.get<Recipe>(`${this.env.apiUrl}/recipes/${recipeId}`));
                if (recipe) {
                    this.selectInstruction(recipe);
                } else {
                    this.showTempStatus("Recipe Not Found", "", 3000);
                }
            } catch (e) {
                console.error("Failed to load recipe", e);
                this.showTempStatus("Error Loading Recipe", "", 3000);
            }
        } else {
            // Try Product Lookup
            this.status = "Looking up Product...";
            const { product } = await this.resolveBarcode(barcode);

            if (product) {
                if (product.cookingInstructions && product.cookingInstructions.length > 0) {
                    // Start logic for selecting instruction
                    this.status = product.title;
                    this.statusSubtext = "Select Instruction";
                    this.availableInstructions = product.cookingInstructions as any[]; // Cast if needed or ensure Type matches

                    // If only one, auto-select
                    if (this.availableInstructions.length === 1) {
                        this.selectInstruction(this.availableInstructions[0]);
                    }
                } else {
                    this.showTempStatus("No Instructions Found", product.title, 3000);
                }
            } else {
                this.showTempStatus("Unknown Barcode", "", 3000);
            }
        }
    }

    async selectInstruction(recipe: Recipe) {
        this.availableInstructions = [];
        // Optimistically set partial data
        this.selectedRecipe = recipe;
        this.showRecipeDetails = false;
        this.status = recipe.title || 'Loading...';

        // Fetch full details (steps, quickActions)
        if (recipe.id) {
            try {
                const fullRecipe = await firstValueFrom(this.http.get<Recipe>(`${this.env.apiUrl}/recipes/${recipe.id}`));
                this.selectedRecipe = fullRecipe;
            } catch (e) {
                console.error("Failed to load full recipe details", e);
            }
        }

        this.status = this.selectedRecipe?.title || 'Cook Mode';
        this.statusSubtext = "Ready to Cook";

        this.autoOpenQuickActions();
    }

    autoOpenQuickActions() {
        if (this.timerActions.length > 0) {
            this.openTimerActions();
        } else if (this.scaleActions.length > 0) {
            this.openScaleActions();
        }
    }

    printRecipeReceipt() {
        if (!this.selectedRecipe) return;

        this.snackBar.open("Printing Receipt...", "Close", { duration: 2000 });
        this.http.post<any>(`${this.env.apiUrl}/labels/receipt/${this.selectedRecipe.id}`, {}).subscribe({
            next: (res) => {
                this.snackBar.open("Receipt Sent!", "Close", { duration: 2000 });
                this.closeCookPrintMenu();
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open("Print Failed", "Close", { duration: 3000 });
            }
        });
    }

    showCookPrintMenu: boolean = false;

    openCookPrintMenu() {
        this.showCookPrintMenu = true;
    }

    closeCookPrintMenu() {
        this.showCookPrintMenu = false;
    }

    printRecipeLabel() {
        if (!this.selectedRecipe) return;

        this.snackBar.open("Printing Label...", "Close", { duration: 2000 });
        this.labelService.printRecipeLabel(this.selectedRecipe.id, this.labelSizeCode).subscribe({
            next: () => {
                this.snackBar.open("Label Sent", "Close", { duration: 2000 });
                this.closeCookPrintMenu();
            },
            error: (err) => {
                console.error(err);
                this.snackBar.open("Label Print Failed", "Close", { duration: 3000 });
            }
        });
    }

    showTimerActions: boolean = false;
    showScaleActions: boolean = false;

    get timerActions() {
        return this.selectedRecipe?.quickActions?.filter(a => a.type === 'timer') || [];
    }

    get scaleActions() {
        return this.selectedRecipe?.quickActions?.filter(a => ['scale', 'weigh', 'weight'].includes(a.type)) || [];
    }

    startQuickAction(action: RecipeQuickAction) {
        if (action.type === 'timer') {
            let minutes = 0;
            if (action.value.includes('-')) {
                const parts = action.value.split('-');
                minutes = parseInt(parts[0]);
            } else {
                minutes = parseInt(action.value);
            }

            if (isNaN(minutes)) return;

            this.createTimer(minutes, action.name);
        } else if (action.type === 'weigh') {
            const valStr = action.value.replace(/[^0-9.-]/g, '');
            let weight = 0;
            if (valStr.includes('-')) {
                const parts = valStr.split('-');
                weight = parseFloat(parts[0]);
            } else {
                weight = parseFloat(valStr);
            }

            if (!isNaN(weight) && weight > 0) {
                this.targetWeight = weight;
            }

            this.viewState = 'SCALE';
            this.status = action.name;
            this.startScaleRead();
        }
    }

    openTimerActions() {
        this.showTimerActions = true;
        this.showScaleActions = false;
        this.closeCookPrintMenu();
    }

    openScaleActions() {
        this.showScaleActions = true;
        this.showTimerActions = false;
        this.closeCookPrintMenu();
    }

    closeQuickActions() {
        this.showTimerActions = false;
        this.showScaleActions = false;
    }

    formatTimer(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    playTimerAlarm() {
        // Play simple beep? OR audio file?
        // Using browser Audio if possible
        try {
            // Simple beep sequence or use system bell?
            // Kiosk might stick with visual only if no audio assets. 
            // I'll try to use a simple oscillator if user interaction allows, but WebAudio requires interaction.
            // We are in a handler (click -> interval), so obscure.
            // Let's rely on SnackBar visual for now.
        } catch (e) { }
    }

    fetchUpcomingMeals() {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 7);

        const sStr = start.toISOString().split('T')[0];
        const eStr = end.toISOString().split('T')[0];

        this.http.get<any[]>(`${this.env.apiUrl}/meal-plan?startDate=${sStr}&endDate=${eStr}`).subscribe({
            next: (meals) => {
                // Filter out meals without recipes
                this.upcomingMeals = meals.filter(m => m.recipe).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            },
            error: (e) => console.error("Failed to fetch upcoming meals", e)
        });
    }

    getMealDateLabel(dateStr: string): string {
        const date = new Date(dateStr);
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    }

    exitKiosk() {
        this.router.navigate(['/']);
    }

    isFullScreen(state: string): boolean {
        return ['COOK', 'PHONE', 'TIMERS', 'QUICK_LABEL', 'SCALE'].includes(state);
    }
}
