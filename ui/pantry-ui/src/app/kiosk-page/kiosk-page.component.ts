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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';
import { HardwareBarcodeScannerService } from '../hardware-barcode-scanner.service';
import { ProductListService } from '../components/product-list/product-list.service';
import { TagsService } from '../tags.service';
import { Product, ProductTags, StockItem } from '../types/product';
import { firstValueFrom, Subscription } from 'rxjs';
import { MarkdownModule } from 'ngx-markdown';

type ViewState = 'MAIN' | 'INVENTORY_MENU' | 'UTILITIES' | 'PRINT_LABELS' | 'QUICK_LABEL' | 'SCALE' | 'COOK' | 'TIMERS' | 'TIMER_KEYPAD' | 'HARDWARE' | 'LABELS' | 'LABELS_CUSTOM_DATE';
import { Recipe, RecipeQuickAction } from '../types/recipe';

import { SocketService } from '../services/socket.service';
import { SipService, SipConfig, SipCallState, SipIncomingCall } from '../services/sip.service';
import { SettingsService } from '../settings/settings.service';
import { HardwareService } from '../services/hardware.service';

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
        MarkdownModule,
        MatProgressSpinnerModule
    ],
    templateUrl: './kiosk-page.component.html',
    styleUrls: ['./kiosk-page.component.css']
})
export class KioskPageComponent implements OnInit, OnDestroy {
    // Status Section
    status: string = 'Ready';
    statusSubtext: string = '';
    activeMode: 'NONE' | 'RESTOCK' | 'CONSUME' | 'CHECK_STATUS' = 'NONE';

    // Check Status State
    checkStatusProduct: Product | null = null;
    checkStatusStockItem: StockItem | null = null;
    checkStatusStockItems: StockItem[] = [];
    checkStatusIsStockScan: boolean = false;

    // Restock State
    restockState: 'SCAN' | 'OPTIONS' | 'WEIGH' | 'EXPIRATION' | 'QUANTITY_PAD' = 'SCAN';
    pendingProduct: Product | null = null;
    pendingExpiration: Date | null = null;
    pendingQuantity: number = 1;
    numpadValue: string = '';

    // Leftover State
    leftoverState: 'OPTIONS' | 'WEIGH' | 'QUANTITY_PAD' | 'EXPIRATION' = 'OPTIONS';
    leftoverQuantity: number = 1;
    leftoverWeight: number = 0;
    leftoverMode: 'QUANTITY' | 'WEIGHT' = 'QUANTITY';
    leftoverExpiration: Date | null = null;
    showLeftoverModal: boolean = false;

    // Inventory Edit State
    inventoryState: 'SCAN' | 'DETAILS' | 'WEIGH' | 'QUANTITY' | 'EXPIRATION' | 'LOCATION' | 'OTHER_STOCK' = 'SCAN';
    inventoryProduct: Product | null = null;
    inventoryStockItems: StockItem[] = []; // All items for this product
    inventorySelectedStockItem: StockItem | null = null;
    inventoryLocations: any[] = []; // Cache locations

    isOnline: boolean = false;

    // View State
    viewState: ViewState | 'PHONE' = 'MAIN';

    // Info Footer
    pantryName = '';
    appVersion = '';
    currentDate: Date = new Date();
    timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
    private timer: any;

    // Printer logic
    labelSizeCode: string = 'continuous';

    // Quick Label Logic
    quickLabelTypes: string[] = ['Prepared', 'Expires', 'Best By', 'Opened'];
    quickLabelSelectedType: string = 'Prepared';
    quickLabelDate: Date = new Date();

    // Labels Feature (merged Presets + Quick Label)
    labelActions: string[] = ['Prepared', 'Opened', 'Thawed', 'Frozen', 'Best by'];
    labelSelectedAction: string = 'Prepared';
    labelDayOptions: { label: string; value: string }[] = [
        { label: 'Today', value: 'today' },
        { label: '+3 Days', value: '+3' },
        { label: '+1 Week', value: '+7' },
        { label: 'Custom', value: 'custom' }
    ];
    labelSelectedDay: string = 'today';
    labelCustomDateDigits: string = '';
    labelCustomDateConfirmed: string = ''; // The formatted date string once confirmed

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
    keypadMinutes: string = '';
    expiredTimer: any = null;
    private alarmInterval: any = null;
    private alarmContext: AudioContext | null = null;
    targetWeight: number | null = null;
    showRecipeDetails: boolean = false;
    activeMealPlanId: number | null | undefined = null;


    upcomingMeals: any[] = [];
    private timersSub: Subscription | null = null;

    // Hardware Test Logic
    micStream: MediaStream | null = null;
    micVolume: number = 0;
    audioContext: AudioContext | null = null;
    analyser: AnalyserNode | null = null;
    micFrameId: number | null = null;
    bridgeVersion: string = '';
    scaleInfo: any = null;
    isLoadingBridgeVersion: boolean = false;

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
        private sipService: SipService,
        private settingsService: SettingsService,
        private hardwareService: HardwareService
    ) { }

    ngOnInit(): void {
        this.pantryName = this.env.siteName;
        this.appVersion = this.env.appVersion;

        // Load Timezone
        this.settingsService.getSettings().subscribe(res => {
            if (res.data && res.data['system_timezone']) {
                this.timezone = res.data['system_timezone'];
            }
        });

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
        // Create a handler for main menu scans
        this.hardwareScanner.setCustomHandler(this.handleMainBarcode.bind(this));

        const kIdStr = localStorage.getItem('kiosk_id');
        if (kIdStr) {
            const kioskId = parseInt(kIdStr);
            this.hardwareScanner.claimScanner(kioskId);
        }

        this.hardwareScanner.claimedBy$.subscribe(claimer => {
            this.scannerClaimedBy = claimer;
            this.amIClaiming = claimer === 'Me';
        });

        // SIP Init
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
            // Local decrement for smoothness based on calculated end time if available
            const now = Date.now();
            this.activeTimers.forEach(t => {
                const prevRemaining = t.remainingSeconds;
                if (t.endTimestamp) {
                    const remaining = Math.max(0, Math.floor((t.endTimestamp - now) / 1000));
                    t.remainingSeconds = remaining;
                } else if (t.remainingSeconds > 0) {
                    t.remainingSeconds--;
                }
                // Detect timer just expired (was > 0, now === 0)
                if (prevRemaining > 0 && t.remainingSeconds === 0 && !this.expiredTimer) {
                    this.triggerTimerExpired(t);
                }
            });
        }, 1000);
    }
    ngOnDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        this.activeTimers.forEach(t => clearInterval(t.interval));
        this.hardwareScanner.setCustomHandler(null);
        if (this.timersSub) this.timersSub.unsubscribe();
        this.stopAlarm();
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

    // Session State
    sessionLog: { title: string, status: string, time: Date, type: 'success' | 'error' | 'info' }[] = [];
    lastScan: { title: string, status: string, type: 'success' | 'error' | 'info' } | null = null;

    private addToLog(title: string, status: string, type: 'success' | 'error' | 'info' = 'success') {
        this.lastScan = { title, status, type };
        this.sessionLog.unshift({ title, status, time: new Date(), type });
        // Keep log size manageable
        if (this.sessionLog.length > 50) this.sessionLog.pop();
    }

    // Actions
    setMode(mode: 'RESTOCK' | 'CONSUME' | 'CHECK_STATUS') {
        this.activeMode = mode;
        this.status = 'Scan Barcode...';
        this.statusSubtext = '';
        this.sessionLog = [];
        this.lastScan = null;

        // Reset Sub-states
        this.restockState = 'SCAN';
        this.inventoryState = 'SCAN';
        this.pendingProduct = null;
        this.inventoryProduct = null;
        this.inventoryStockItems = [];
        this.inventorySelectedStockItem = null;
        this.checkStatusProduct = null;
        this.checkStatusStockItem = null;
        this.checkStatusStockItems = [];
        this.checkStatusIsStockScan = false;

        if (mode === 'RESTOCK') {
            this.hardwareScanner.setCustomHandler(this.handleRestockBarcode.bind(this));
        } else if (mode === 'CONSUME') {
            this.hardwareScanner.setCustomHandler(this.handleConsumeBarcode.bind(this));
        } else if (mode === 'CHECK_STATUS') {
            this.hardwareScanner.setCustomHandler(this.handleCheckStatusBarcode.bind(this));
        }
    }

    openInventoryMenu() {
        this.viewState = 'INVENTORY_MENU';
        this.status = 'Inventory';
        this.statusSubtext = '';
        this.activeMode = 'NONE';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    closeInventoryMenu() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
        this.statusSubtext = '';
        this.activeMode = 'NONE';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    finishAction() {
        this.activeMode = 'NONE';
        this.status = 'Inventory';
        this.statusSubtext = '';
        this.viewState = 'INVENTORY_MENU';
        this.hardwareScanner.setCustomHandler(() => { });
    }

    async extendTimer(id: number, seconds: number) {
        try {
            await firstValueFrom(this.http.patch(`${this.env.apiUrl}/timers/${id}/extend`, { seconds }));
            this.snackBar.open(`Added ${seconds / 60}m`, "Close", { duration: 2000 });
            this.fetchTimers();
        } catch (err) {
            console.error("Failed to extend timer", err);
        }
    }

    async restartTimer(id: number) {
        try {
            await firstValueFrom(this.http.patch(`${this.env.apiUrl}/timers/${id}/restart`, {}));
            this.snackBar.open("Timer Restarted", "Close", { duration: 2000 });
            this.fetchTimers();
        } catch (err) {
            console.error("Failed to restart timer", err);
        }
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

    async handleMainBarcode(barcode: string) {
        if (!barcode) return;
        this.status = "Analyzing...";

        // HOME ASSISTANT SCAN — handled by backend MQTT, don't process locally
        if (barcode.toLowerCase().startsWith('ha:')) {
            this.status = "Sent to Home Assistant";
            this.statusSubtext = barcode.substring(3);
            this.addToLog("Home Assistant", barcode.substring(3), 'info');
            this.playSuccessSound();
            this.showTempStatus("Sent to Home Assistant", barcode.substring(3), 3000);
            return;
        }

        // RECIPE SCAN
        if (barcode.toLowerCase().startsWith('r-')) {
            const rId = barcode.substring(2);
            try {
                const recipe = await firstValueFrom(this.http.get<Recipe>(`${this.env.apiUrl}/recipes/${rId}`));
                if (recipe) {
                    this.selectedRecipe = recipe;
                    this.openCook();
                    return;
                }
            } catch (e) {
                console.error("Failed to load recipe", e);
                this.status = "Recipe Not Found";
                this.showTempStatus("Recipe Not Found", "", 2000);
            }
        }

        // GENERIC / PRODUCT SCAN - Quick Check Status
        await this.handleCheckStatusBarcode(barcode);
        // Auto-navigate into check status view
        if (this.checkStatusProduct) {
            this.activeMode = 'CHECK_STATUS';
            this.viewState = 'INVENTORY_MENU';
        }
    }

    async handleRestockBarcode(barcode: string) {
        if (!barcode) return;

        // HOME ASSISTANT SCAN — handled by backend MQTT
        if (barcode.toLowerCase().startsWith('ha:')) {
            this.addToLog("Home Assistant", barcode.substring(3), 'info');
            this.playSuccessSound();
            this.showTempStatus("Sent to Home Assistant", barcode.substring(3), 3000);
            return;
        }

        // If we have a pending product in OPTIONS mode, save it first!
        if (this.restockState === 'OPTIONS' && this.pendingProduct) {
            await this.saveCurrentPendingItem();
        }

        // Reset
        this.restockState = 'SCAN';
        this.pendingProduct = null;
        this.pendingExpiration = null;
        this.pendingQuantity = 1;
        this.numpadValue = '';
        this.stopScaleRead();

        this.status = "Looking up product...";
        this.lastScan = { title: 'Processing...', status: 'Looking up...', type: 'info' };

        try {
            const { product, stockItem } = await this.resolveBarcode(barcode);

            if (product) {
                // Intercept ALL products for Options (Weight or Quantity)
                this.pendingProduct = product;

                // Default Exp logic with Gemini Enhancement
                let days = product.refrigeratorLifespanDays || product.pantryLifespanDays;

                if (!days) {
                    this.status = "Consulting AI...";
                    this.statusSubtext = "Estimating Expiry...";

                    try {
                        const geminiRes = await firstValueFrom(this.http.post<any>(this.env.apiUrl + "/gemini/product-details", {
                            productTitle: product.title,
                            productId: product.id
                        }));
                        if (geminiRes && geminiRes.data) {
                            // We prefer refrigerator lifespan for fresh items usually
                            const gDays = geminiRes.data.refrigeratorLifespanDays || geminiRes.data.pantryLifespanDays;
                            if (gDays) {
                                days = gDays;
                                // Automatically saved to product on backend if productId was provided
                            }
                        }
                    } catch (e) {
                        console.warn("Gemini expiration lookup failed", e);
                    }
                }

                if (!days) days = 365;

                const today = new Date();
                const defExp = new Date();
                defExp.setDate(today.getDate() + days);
                defExp.setHours(0, 0, 0, 0);
                this.pendingExpiration = defExp;

                this.restockState = 'OPTIONS';
                this.status = "Item Options";
                this.statusSubtext = product.title;
                this.playSuccessSound();
                return;

            } else {
                // Not Found
                if (barcode.toLowerCase().startsWith('sk-') || barcode.toLowerCase().startsWith('s2-')) {
                    this.status = "Stock Item Not Found";
                    this.addToLog("Stock Item Not Found", "", 'error');
                    this.playErrorSound();
                    return;
                }
                await this.handleNewProduct(barcode);
            }
        } catch (err) {
            console.error("Scan Error", err);
            this.status = "Error processing scan.";
            this.addToLog("Scan Error", "Failed to process", 'error');
            this.playErrorSound();
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async handleConsumeBarcode(barcode: string) {
        if (!barcode) return;

        // HOME ASSISTANT SCAN — handled by backend MQTT
        if (barcode.toLowerCase().startsWith('ha:')) {
            this.addToLog("Home Assistant", barcode.substring(3), 'info');
            this.playSuccessSound();
            this.showTempStatus("Sent to Home Assistant", barcode.substring(3), 3000);
            return;
        }
        this.status = "Looking up product...";
        this.lastScan = { title: 'Processing...', status: 'Looking up...', type: 'info' };

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
                    this.addToLog(product.title, "-1 Consumed", 'success');
                    this.playSuccessSound();
                } else {
                    this.status = "Out of Stock";
                    this.statusSubtext = product.title;
                    this.addToLog(product.title, "Out of Stock", 'error');
                    this.playErrorSound();
                }

            } else {
                this.status = "Product Not Found";
                this.statusSubtext = "Try adding it in Restock";
                this.addToLog("Product Not Found", "", 'error');
                this.playErrorSound();
            }
        } catch (err) {
            console.error("Scan Error", err);
            this.status = "Error processing scan.";
            this.addToLog("Scan Error", "Failed to process", 'error');
            this.playErrorSound();
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async handleCheckStatusBarcode(barcode: string) {
        if (!barcode) return;

        // HOME ASSISTANT SCAN — handled by backend MQTT
        if (barcode.toLowerCase().startsWith('ha:')) {
            this.addToLog("Home Assistant", barcode.substring(3), 'info');
            this.playSuccessSound();
            this.showTempStatus("Sent to Home Assistant", barcode.substring(3), 3000);
            return;
        }
        this.status = "Checking Status...";
        this.statusSubtext = "";

        // Reset
        this.checkStatusProduct = null;
        this.checkStatusStockItem = null;
        this.checkStatusStockItems = [];
        this.checkStatusIsStockScan = false;

        try {
            const { product, stockItem } = await this.resolveBarcode(barcode);

            if (product) {
                this.checkStatusProduct = product;

                // Sort stock items
                let allItems = product.stockItems || [];
                allItems.sort((a, b) => {
                    const da = a.expirationDate ? new Date(a.expirationDate).getTime() : 9999999999999;
                    const db = b.expirationDate ? new Date(b.expirationDate).getTime() : 9999999999999;
                    return da - db;
                });
                this.checkStatusStockItems = allItems;

                if (stockItem) {
                    this.checkStatusIsStockScan = true;
                    this.checkStatusStockItem = stockItem;
                }

                this.status = "Check Status";
                this.statusSubtext = product.title;
                this.playSuccessSound();
            } else {
                this.status = "Product Not Found";
                this.statusSubtext = "";
                this.showTempStatus("Product Not Found", "", 3000);
                this.playErrorSound();
            }
        } catch (err) {
            console.error("Scan Error", err);
            this.status = "Error processing scan.";
            this.playErrorSound();
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    // Legacy inventory handler — delegates to check status
    async handleInventoryBarcode(barcode: string) {
        await this.handleCheckStatusBarcode(barcode);
    }

    get checkStatusTotalQty(): number {
        return this.checkStatusStockItems.reduce((acc, item) => acc + item.quantity, 0);
    }

    get checkStatusNextExpire(): Date | null {
        if (this.checkStatusStockItems.length === 0) return null;
        const d = this.checkStatusStockItems[0].expirationDate;
        return d ? new Date(d) : null;
    }

    isExpiringSoon(): boolean {
        const expDate = this.getRelevantExpDate();
        if (!expDate) return false;
        const now = new Date();
        const diff = expDate.getTime() - now.getTime();
        const days = diff / (1000 * 60 * 60 * 24);
        return days <= 7;
    }

    isExpired(): boolean {
        const expDate = this.getRelevantExpDate();
        if (!expDate) return false;
        return expDate.getTime() < new Date().getTime();
    }

    private getRelevantExpDate(): Date | null {
        if (this.checkStatusIsStockScan && this.checkStatusStockItem) {
            return this.checkStatusStockItem.expirationDate ? new Date(this.checkStatusStockItem.expirationDate) : null;
        }
        return this.checkStatusNextExpire;
    }

    // --- INVENTORY ACTIONS ---

    get inventoryTotalQty(): number {
        return this.inventoryStockItems.reduce((acc, item) => acc + item.quantity, 0);
    }

    get inventoryNearestExp(): Date | null {
        if (this.inventoryStockItems.length === 0) return null;
        // sorted in handleInventoryBarcode
        const d = this.inventoryStockItems[0].expirationDate;
        return d ? new Date(d) : null;
    }

    printInventoryLabel() {
        if (!this.inventorySelectedStockItem || !this.inventorySelectedStockItem.id) return;

        this.snackBar.open("Printing...", "Close", { duration: 1500 });

        this.labelService.printStockLabel(this.inventorySelectedStockItem.id, this.labelSizeCode).subscribe({
            next: () => {
                this.snackBar.open("Label Sent", "Close", { duration: 1500 });
                this.playSuccessSound();
            },
            error: (err) => {
                console.error("Print failed", err);
                this.snackBar.open("Print Failed", "Close", { duration: 2000 });
                this.playErrorSound();
            }
        });
    }

    // Scale / Weight
    openInventoryWeight() {
        this.inventoryState = 'WEIGH';
        this.startScaleRead();
    }

    // Quantity
    openInventoryQuantity() {
        this.inventoryState = 'QUANTITY';
        this.numpadValue = '';
    }

    // Expiration
    openInventoryExpiration() {
        this.inventoryState = 'EXPIRATION';
    }

    // Location
    openInventoryLocation() {
        this.status = "Loading Locations...";
        this.http.get<any[]>(`${this.env.apiUrl}/locations`).subscribe({
            next: (locs) => {
                this.inventoryLocations = locs;
                this.inventoryState = 'LOCATION';
                this.status = "Select Location";
            },
            error: () => {
                this.snackBar.open("Failed to load locations", "Close");
                this.status = "Edit Inventory";
            }
        });
    }

    // Other Stock
    openOtherStock() {
        this.inventoryState = 'OTHER_STOCK';
    }

    selectOtherStock(item: StockItem) {
        this.inventorySelectedStockItem = item;
        this.inventoryState = 'DETAILS';
    }

    // Remove
    removeInventoryItem() {
        if (!this.inventorySelectedStockItem) return;
        if (confirm("Are you sure you want to delete this item?")) {
            this.http.delete(`${this.env.apiUrl}/stock-items/${this.inventorySelectedStockItem.id}`).subscribe(() => {
                this.snackBar.open("Item Deleted", "Close", { duration: 2000 });

                // Refresh
                // Remove from local list
                this.inventoryStockItems = this.inventoryStockItems.filter(i => i.id !== this.inventorySelectedStockItem?.id);

                if (this.inventoryStockItems.length > 0) {
                    this.inventorySelectedStockItem = this.inventoryStockItems[0];
                    this.inventoryState = 'DETAILS';
                } else {
                    // Empty
                    this.finishAction(); // Go back to scan
                }
                this.playSuccessSound();
            });
        }
    }

    // UPDATE HELPERS
    backToInventoryDetails() {
        this.stopScaleRead();
        this.inventoryState = 'DETAILS';
        this.status = "Edit Inventory";
    }

    async updateInventoryWeight() {
        if (!this.inventorySelectedStockItem || this.currentWeight <= 0) return;

        const payload = { ...this.inventorySelectedStockItem, quantity: this.currentWeight };
        await this.updateStockItemGeneric(payload);
        this.backToInventoryDetails();
    }

    async updateInventoryQuantity() {
        const val = parseInt(this.numpadValue);
        if (!this.inventorySelectedStockItem || isNaN(val) || val < 0) return; // Allow 0? maybe not.

        const payload = { ...this.inventorySelectedStockItem, quantity: val };
        await this.updateStockItemGeneric(payload);
        this.backToInventoryDetails();
    }

    async setInventoryExpiration(val: string) {
        if (!this.inventorySelectedStockItem) return;
        const today = new Date();
        let d: Date | null = new Date();
        d.setHours(0, 0, 0, 0);

        switch (val) {
            case '4d': d.setDate(today.getDate() + 4); break;
            case '1w': d.setDate(today.getDate() + 7); break;
            case '2w': d.setDate(today.getDate() + 14); break;
            case '6m': d.setMonth(today.getMonth() + 6); break;
            case '1y': d.setFullYear(today.getFullYear() + 1); break;
            case '2y': d.setFullYear(today.getFullYear() + 2); break;
            case 'none': d = null; break;
            default: d = null;
        }

        const payload = { ...this.inventorySelectedStockItem, expirationDate: d };
        await this.updateStockItemGeneric(payload);
        this.backToInventoryDetails();
    }

    async setInventoryLocation(locationId: number) {
        if (!this.inventorySelectedStockItem) return;
        const payload = { ...this.inventorySelectedStockItem, locationId: locationId };
        await this.updateStockItemGeneric(payload);
        this.backToInventoryDetails();
    }

    async updateStockItemGeneric(limitPayload: any) {
        try {
            await firstValueFrom(this.http.patch(`${this.env.apiUrl}/stock-items/${limitPayload.id}`, limitPayload));
            this.snackBar.open("Updated", "Close", { duration: 1500 });

            // Update local reference
            if (this.inventorySelectedStockItem) {
                Object.assign(this.inventorySelectedStockItem, limitPayload);
            }
            this.playSuccessSound();
        } catch (e) {
            console.error("Update failed", e);
            this.playErrorSound();
        }
    }

    async handleNewProduct(barcode: string) {
        this.status = "Checking external sources...";

        // OFF Lookup
        let offProductName: string = '';
        let offBrand: string = '';
        try {
            const offRes = await firstValueFrom(this.http.get<any>("https://world.openfoodfacts.org/api/v2/product/" + barcode));
            if (offRes && offRes.product) {
                offProductName = offRes.product.product_name || '';
                offBrand = offRes.product.brands || '';
            }
        } catch (e) { console.warn("OFF lookup failed"); }

        // Even without OFF data, proceed — Gemini may still identify 
        // the product from the barcode number alone.
        const productName = offProductName || `Barcode ${barcode}`;
        const brand = offBrand;

        this.status = "Consulting AI...";

        // Gemini Match Check — try to link to an existing product
        let matchId: number | null = null;
        // Only attempt match if we have a real product name from OFF
        if (offProductName) {
            try {
                const matchRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/product-match`, {
                    productName,
                    brand
                }));
                matchId = matchRes.matchId || null;

                if (matchId) {
                    // LINK to existing
                    try {
                        const existingProduct = await firstValueFrom(this.productService.Get(matchId));

                        // Add barcode to product
                        const updatedBarcodes = existingProduct.barcodes || [];
                        updatedBarcodes.push({
                            barcode: barcode,
                            brand: brand,
                            description: "Added via Kiosk",
                            tags: [],
                            ProductId: existingProduct.id,
                            id: 0,
                            quantity: 1
                        });

                        const updatePayload = {
                            ...existingProduct,
                            barcodes: updatedBarcodes
                        };

                        await firstValueFrom(this.productService.Update(updatePayload));

                        this.pendingProduct = existingProduct;
                        const today = new Date();
                        const days = existingProduct.refrigeratorLifespanDays || 365;
                        const defExp = new Date();
                        defExp.setDate(today.getDate() + days);
                        defExp.setHours(0, 0, 0, 0);
                        this.pendingExpiration = defExp;
                        this.pendingQuantity = 1;

                        this.restockState = 'OPTIONS';
                        this.status = "Item Options";
                        this.statusSubtext = existingProduct.title;

                        this.addToLog(existingProduct.title, "Linked - Select Options", 'info');
                        this.playSuccessSound();
                        return;
                    } catch (linkErr) {
                        console.error("Failed to link to existing product", linkErr);
                        // Fall through to create new
                        matchId = null;
                    }
                }
            } catch (matchErr) {
                console.warn("Gemini product-match failed, will create new product", matchErr);
            }
        }

        // CREATE NEW — attempt with Gemini barcode-details
        try {
            this.status = "Analyzing product details...";
            const detailsRes = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/gemini/barcode-details`, {
                productName,
                brand,
                existingProductTitle: ""
            }));
            const details = detailsRes.data;

            // VALIDATION: If still unknown or generic, FAIL
            const candidateTitle = details.title || offProductName;
            if (!candidateTitle || candidateTitle === 'Unknown Product' || candidateTitle === 'New Product' || candidateTitle === `Barcode ${barcode}`) {
                this.status = "Unknown Product";
                this.statusSubtext = offProductName ? "AI could not identify" : "Not in OpenFoodFacts";
                this.addToLog("Unknown Product", "Could not identify", 'error');
                this.playErrorSound();
                setTimeout(() => this.status = "Scan Barcode...", 3000);
                return;
            }

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
                title: candidateTitle,
                tags: productTags,
                barcodes: [{
                    barcode: barcode,
                    brand: details.brand || brand || "",
                    description: details.description || "",
                    tags: [],
                    quantity: 1
                }],
                refrigeratorLifespanDays: details.refrigeratorLifespanDays,
                freezerLifespanDays: details.freezerLifespanDays,
                openedLifespanDays: details.openedLifespanDays,
                trackCountBy: details.trackCountBy || 'quantity',
                autoPrintLabel: details.autoPrintLabel || false,
            };

            const createdProduct = await firstValueFrom(this.productService.Create(newProductPayload));

            this.status = `Adding new product...`;

            this.pendingProduct = createdProduct;
            const today = new Date();
            const days = createdProduct.refrigeratorLifespanDays || 365;
            const defExp = new Date();
            defExp.setDate(today.getDate() + days);
            defExp.setHours(0, 0, 0, 0);
            this.pendingExpiration = defExp;
            this.pendingQuantity = 1;

            this.restockState = 'OPTIONS';
            this.status = "Item Options";
            this.statusSubtext = createdProduct.title;
            this.playSuccessSound();
            return;

        } catch (e) {
            console.error("AI/Create failed", e);
            this.status = "Failed to process product.";
            this.statusSubtext = offProductName ? `${offProductName} — AI error` : "Product not found in databases";
            this.addToLog("Processing Failed", offProductName || barcode, 'error');
            this.playErrorSound();
            setTimeout(() => this.status = "Scan Barcode...", 3000);
        }
    }

    async addStock(product: Product, quantity: number, explicitExpiration?: Date | null): Promise<StockItem | null> {
        // Create stock item
        const today = new Date();

        let expDate: Date | null | undefined = explicitExpiration;

        // If explicitExpiration is not provided, use default calculation
        if (expDate === undefined) {
            // Default expiration?
            const days = product.refrigeratorLifespanDays || 365;
            const d = new Date();
            d.setDate(today.getDate() + days);
            d.setHours(0, 0, 0, 0);
            expDate = d;
        }

        // If expDate is null (meaning 'None'), we should probably set it to null in payload
        // The API/Type expects Date | null.

        return await firstValueFrom(this.productService.CreateStock({
            productId: product.id,
            quantity: quantity,
            expirationDate: expDate as any, // Cast to any if strict null checks complain, but StockItem allows null? Schema says DateTime? (nullable).
            productBarcodeId: product.barcodes?.[0]?.id || 0,
            opened: false,
            frozen: false,
            expirationExtensionAfterThaw: 0,
            unit: product.trackCountBy === 'weight' ? 'g' : 'unit'
        }), { defaultValue: null });
    }

    // RESTOCK UI HELPERS
    openRestockWeigh() {
        this.restockState = 'WEIGH';
        this.startScaleRead();
    }

    openRestockExpiration() {
        this.restockState = 'EXPIRATION';
    }

    openRestockQuantity() {
        this.restockState = 'QUANTITY_PAD';
        this.numpadValue = '';
    }

    cancelRestockItem() {
        this.restockState = 'SCAN';
        this.pendingProduct = null;
        this.pendingExpiration = null;
        this.pendingQuantity = 1;
        this.numpadValue = '';
        this.status = 'Scan Barcode...';
        this.statusSubtext = '';
        this.stopScaleRead();
    }

    numpadInput(digit: string) {
        if (this.numpadValue.length >= 4) return;
        this.numpadValue += digit;
    }

    numpadBackspace() {
        this.numpadValue = this.numpadValue.slice(0, -1);
    }

    numpadConfirm() {
        const val = parseInt(this.numpadValue);
        if (!isNaN(val) && val > 0) {
            this.pendingQuantity = val;
            this.backToRestockOptions();
        } else {
            this.backToRestockOptions();
        }
    }

    backToRestockOptions() {
        this.stopScaleRead();
        this.restockState = 'OPTIONS';
        this.status = "Item Options";
    }

    async saveCurrentPendingItem(): Promise<boolean> {
        if (!this.pendingProduct) return false;

        try {
            const addedItem = await this.addStock(this.pendingProduct, this.pendingQuantity, this.pendingExpiration);

            let expStr = "";
            if (addedItem && addedItem.expirationDate) {
                expStr = ` (Exp: ${new Date(addedItem.expirationDate).toLocaleDateString()})`;
            }

            this.addToLog(this.pendingProduct.title, `+${this.pendingQuantity} Unit(s) Added${expStr}`, 'success');
            // Sound removed from here (Scan triggers sound or Label triggers sound)

            this.showTempStatus("Added " + this.pendingQuantity + " Unit(s)", this.pendingProduct.title, 2000);
            return true;

        } catch (e) {
            console.error("Failed to add stock", e);
            this.snackBar.open("Failed to add stock", "Close");
            this.playErrorSound();
            return false;
        }
    }

    async confirmRestockItem() {
        if (await this.saveCurrentPendingItem()) {
            this.cancelRestockItem();
        }
    }

    async finishRestockSession() {
        if (this.restockState === 'OPTIONS' && this.pendingProduct) {
            await this.saveCurrentPendingItem();
        }
        this.finishAction();
    }

    setRestockExpiration(val: string) {
        if (!this.pendingProduct) return;
        const today = new Date();
        let d: Date | null = new Date();
        d.setHours(0, 0, 0, 0);

        switch (val) {
            case '4d': d.setDate(today.getDate() + 4); break;
            case '1w': d.setDate(today.getDate() + 7); break;
            case '2w': d.setDate(today.getDate() + 14); break;
            case '6m': d.setMonth(today.getMonth() + 6); break;
            case '1y': d.setFullYear(today.getFullYear() + 1); break;
            case '2y': d.setFullYear(today.getFullYear() + 2); break;
            case 'none': d = null; break;
            default: d = null;
        }

        this.pendingExpiration = d;
        this.backToRestockOptions();
    }

    isProcessing: boolean = false;

    async captureRestockWeight() {
        if (this.isProcessing) return;
        if (!this.pendingProduct) return;
        if (this.currentWeight <= 0) {
            this.snackBar.open("Weight must be > 0", "Close", { duration: 1500 });
            return;
        }

        this.isProcessing = true;

        // Capture
        try {
            const addedItem = await this.addStock(this.pendingProduct, this.currentWeight, this.pendingExpiration);

            if (!this.pendingProduct) {
                // Should not happen if locked, but safety check
                this.isProcessing = false;
                return;
            }

            let expStr = "";
            if (addedItem && addedItem.expirationDate) {
                expStr = ` (Exp: ${new Date(addedItem.expirationDate).toLocaleDateString()})`;
            }

            // weight log
            const weightStr = `${this.currentWeight}g`;

            this.addToLog(this.pendingProduct.title, `+${weightStr} Added${expStr}`, 'success');
            this.playSuccessSound();

            // Reset
            this.cancelRestockItem();
            this.showTempStatus("Weight Added", this.pendingProduct!.title, 2000);

        } catch (e) {
            console.error("Failed to add weighted stock", e);
            this.snackBar.open("Failed to add stock", "Close");
            this.playErrorSound();
        } finally {
            this.isProcessing = false;
        }
    }

    playSuccessSound() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);

            // Cleanup provided by GC largely, but context persists. 
            // Ideally reuse context but for simple one-off:
            setTimeout(() => ctx.close(), 500);
        } catch (e) { }
    }

    playErrorSound() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);

            setTimeout(() => ctx.close(), 500);
        } catch (e) { }
    }

    getTimerForAction(action: RecipeQuickAction): any | undefined {
        return this.activeTimers.find(t => t.name === action.name);
    }

    showTempStatus(msg: string, subtext: string, duration: number) {
        // If we want to show the specific message for duration
        // logic below was just resetting. 
        // We set the status immediately before calling this.

        setTimeout(() => {
            if (this.activeMode === 'RESTOCK' || this.activeMode === 'CONSUME' || this.activeMode === 'CHECK_STATUS') {
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

    // --- LABELS FEATURE (Merged Presets + Quick Label) ---
    openLabels() {
        this.viewState = 'LABELS';
        this.status = 'Labels';
        this.statusSubtext = '';
        this.labelSelectedAction = 'Prepared';
        this.labelSelectedDay = 'today';
        this.labelCustomDateDigits = '';
        this.labelCustomDateConfirmed = '';
    }

    closeLabels() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
        this.statusSubtext = '';
    }

    selectLabelAction(action: string) {
        this.labelSelectedAction = action;
    }

    selectLabelDay(value: string) {
        if (value === 'custom') {
            this.labelSelectedDay = 'custom';
            this.openLabelsCustomDate();
        } else {
            this.labelSelectedDay = value;
        }
    }

    getLabelActionIcon(action: string): string {
        switch (action) {
            case 'Prepared': return 'restaurant';
            case 'Opened': return 'calendar_today';
            case 'Thawed': return 'ac_unit';
            case 'Frozen': return 'severe_cold';
            case 'Best by': return 'verified';
            default: return 'label';
        }
    }

    getLabelDate(): Date {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        switch (this.labelSelectedDay) {
            case 'today': return today;
            case '+3': {
                const d = new Date(today);
                d.setDate(d.getDate() + 3);
                return d;
            }
            case '+7': {
                const d = new Date(today);
                d.setDate(d.getDate() + 7);
                return d;
            }
            case 'custom': {
                if (this.labelCustomDateDigits.length === 8) {
                    const mm = parseInt(this.labelCustomDateDigits.substring(0, 2), 10);
                    const dd = parseInt(this.labelCustomDateDigits.substring(2, 4), 10);
                    const yyyy = parseInt(this.labelCustomDateDigits.substring(4, 8), 10);
                    return new Date(yyyy, mm - 1, dd);
                }
                return today;
            }
            default: return today;
        }
    }

    get labelDayDisplayText(): string {
        if (this.labelSelectedDay === 'custom' && this.labelCustomDateConfirmed) {
            return this.labelCustomDateConfirmed;
        }
        const d = this.getLabelDate();
        return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }

    get customDayButtonText(): string {
        if (this.labelCustomDateConfirmed) {
            return this.labelCustomDateConfirmed;
        }
        return 'Custom';
    }

    printLabelNew() {
        const date = this.getLabelDate();
        this.labelService.printQuickLabel(
            this.labelSelectedAction,
            date,
            this.labelSizeCode
        ).subscribe({
            next: () => {
                this.snackBar.open('Label printed!', 'Close', { duration: 2000 });
            },
            error: (err) => {
                console.error('Print failed', err);
                this.snackBar.open('Failed to print label', 'Close', { duration: 2000 });
            }
        });
    }

    // --- LABELS CUSTOM DATE KEYPAD ---
    openLabelsCustomDate() {
        this.labelCustomDateDigits = '';
        this.viewState = 'LABELS_CUSTOM_DATE';
        this.status = 'Custom Date';
    }

    get labelCustomDateDisplay(): string {
        const digits = this.labelCustomDateDigits;
        const template = ['_', '_', '/', '_', '_', '/', '_', '_', '_', '_'];
        // Map digits into positions: mm/dd/yyyy
        // positions: 0,1 = month; 3,4 = day; 6,7,8,9 = year
        const positions = [0, 1, 3, 4, 6, 7, 8, 9];
        for (let i = 0; i < digits.length && i < 8; i++) {
            template[positions[i]] = digits[i];
        }
        return template.join('');
    }

    get isCustomDateComplete(): boolean {
        return this.labelCustomDateDigits.length === 8;
    }

    get isCustomDateValid(): boolean {
        if (!this.isCustomDateComplete) return false;
        const mm = parseInt(this.labelCustomDateDigits.substring(0, 2), 10);
        const dd = parseInt(this.labelCustomDateDigits.substring(2, 4), 10);
        const yyyy = parseInt(this.labelCustomDateDigits.substring(4, 8), 10);
        if (mm < 1 || mm > 12) return false;
        if (dd < 1 || dd > 31) return false;
        if (yyyy < 2020 || yyyy > 2099) return false;
        // Basic validation - check if the date is real
        const testDate = new Date(yyyy, mm - 1, dd);
        return testDate.getMonth() === mm - 1 && testDate.getDate() === dd;
    }

    labelDateKeypadPress(n: number) {
        if (this.labelCustomDateDigits.length < 8) {
            this.labelCustomDateDigits += n.toString();
        }
    }

    labelDateKeypadBackspace() {
        this.labelCustomDateDigits = this.labelCustomDateDigits.slice(0, -1);
    }

    labelDateKeypadCancel() {
        this.labelCustomDateDigits = '';
        this.labelCustomDateConfirmed = '';
        this.labelSelectedDay = 'today';
        this.viewState = 'LABELS';
        this.status = 'Labels';
    }

    labelDateKeypadConfirm() {
        if (this.isCustomDateValid) {
            const mm = this.labelCustomDateDigits.substring(0, 2);
            const dd = this.labelCustomDateDigits.substring(2, 4);
            const yyyy = this.labelCustomDateDigits.substring(4, 8);
            this.labelCustomDateConfirmed = `${mm}/${dd}/${yyyy}`;
            this.viewState = 'LABELS';
            this.status = 'Labels';
        }
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
            this.showScaleOptions = false;
        } else {
            this.viewState = 'MAIN';
            this.status = 'Ready';
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
            name: name || `${minutes} Minutes`,
            duration: duration
        }).subscribe(() => {
            this.snackBar.open("Timer Started", "Close", { duration: 1000 });
            this.fetchTimers();
        });
    }

    openTimerKeypad() {
        this.keypadMinutes = '';
        this.viewState = 'TIMER_KEYPAD';
    }

    closeTimerKeypad() {
        this.viewState = 'TIMERS';
    }

    keypadPress(n: number) {
        if (this.keypadMinutes.length < 3) {
            this.keypadMinutes += n.toString();
        }
    }

    keypadClear() {
        this.keypadMinutes = '';
    }

    keypadBackspace() {
        this.keypadMinutes = this.keypadMinutes.slice(0, -1);
    }

    keypadStartTimer() {
        const minutes = parseInt(this.keypadMinutes, 10);
        if (minutes > 0) {
            this.createTimer(minutes);
            this.viewState = 'TIMERS';
        }
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
                }).filter((t: any) => t.remainingSeconds > 0 || (t.remainingSeconds === 0 && this.expiredTimer?.id === t.id));
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
        return this.currentWeight;
    }

    get weightInGrams(): number {
        return this.currentWeight;
    }

    get weightInOz(): number {
        return this.currentWeight * 0.035274;
    }

    get weightInLbsOz(): string {
        const totalOz = this.currentWeight * 0.035274;
        const lbs = Math.floor(totalOz / 16);
        const remainingOz = totalOz % 16;
        if (lbs > 0) {
            return `${lbs} lb ${remainingOz.toFixed(1)} oz`;
        }
        return `${remainingOz.toFixed(1)} oz`;
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
        this.snackBar.open('Printing shopping list...', 'Close', { duration: 2000 });
        this.labelService.printShoppingList().subscribe({
            next: () => {
                this.snackBar.open('Shopping list sent to printer!', 'Close', { duration: 2000 });
            },
            error: (err) => {
                console.error('Failed to print shopping list', err);
                const msg = err?.error?.message || 'Failed to print shopping list';
                this.snackBar.open(msg, 'Close', { duration: 3000 });
            }
        });
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



    async selectInstruction(recipe: Recipe, mealPlanId?: number) {
        this.activeMealPlanId = mealPlanId || null;
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

    triggerTimerExpired(timer: any) {
        this.expiredTimer = { ...timer };
        this.startAlarm();
    }

    dismissExpiredTimer() {
        if (this.expiredTimer) {
            const id = this.expiredTimer.id;
            this.expiredTimer = null;
            this.stopAlarm();
            // Delete the expired timer from the server
            this.http.delete(`${this.env.apiUrl}/timers/${id}`).subscribe(() => {
                this.fetchTimers();
            });
        }
    }

    startAlarm() {
        // Play alarm sound immediately, then repeat every 2 seconds
        this.playAlarmBeep();
        this.alarmInterval = setInterval(() => {
            this.playAlarmBeep();
        }, 2000);
    }

    stopAlarm() {
        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }
        if (this.alarmContext) {
            try { this.alarmContext.close(); } catch (e) { }
            this.alarmContext = null;
        }
    }

    playAlarmBeep() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Create a loud, attention-grabbing alarm sequence
            const now = ctx.currentTime;

            // First beep (high)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(880, now); // A5
            gain1.gain.setValueAtTime(0.5, now);
            gain1.gain.setValueAtTime(0, now + 0.15);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // Second beep (higher)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(1108.73, now + 0.2); // C#6
            gain2.gain.setValueAtTime(0, now);
            gain2.gain.setValueAtTime(0.5, now + 0.2);
            gain2.gain.setValueAtTime(0, now + 0.35);
            osc2.start(now + 0.2);
            osc2.stop(now + 0.35);

            // Third beep (highest, sustained)
            const osc3 = ctx.createOscillator();
            const gain3 = ctx.createGain();
            osc3.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.type = 'square';
            osc3.frequency.setValueAtTime(1318.51, now + 0.4); // E6
            gain3.gain.setValueAtTime(0, now);
            gain3.gain.setValueAtTime(0.5, now + 0.4);
            gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            osc3.start(now + 0.4);
            osc3.stop(now + 1.0);

            setTimeout(() => ctx.close(), 1500);
        } catch (e) {
            console.error('Failed to play alarm sound', e);
        }
    }

    get sortedSidebarTimers(): any[] {
        return this.activeTimers
            .filter(t => t.remainingSeconds > 0)
            .sort((a, b) => a.remainingSeconds - b.remainingSeconds);
    }

    get showTimerSidebar(): boolean {
        return this.sortedSidebarTimers.length > 0
            && this.viewState !== 'TIMERS'
            && this.viewState !== 'TIMER_KEYPAD';
    }

    sidebarTimerClick() {
        this.openTimers();
    }

    fetchUpcomingMeals() {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 7);

        const sStr = start.toISOString().split('T')[0];
        const eStr = end.toISOString().split('T')[0];

        this.http.get<any[]>(`${this.env.apiUrl}/meal-plan?startDate=${sStr}&endDate=${eStr}`).subscribe({
            next: (meals) => {
                // Filter out meals without recipes OR products with instructions
                this.upcomingMeals = meals.filter(m => {
                    const hasRecipe = !!m.recipe;
                    const hasProductInst = m.product && m.product.cookingInstructions && m.product.cookingInstructions.length > 0;
                    return hasRecipe || hasProductInst;
                }).map(m => {
                    // Normalize title
                    m.displayTitle = m.recipe ? m.recipe.title : m.product.title;
                    return m;
                }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            },
            error: (e) => console.error("Failed to fetch upcoming meals", e)
        });
    }

    selectUpcomingMeal(meal: any) {
        if (meal.recipe) {
            this.selectInstruction(meal.recipe, meal.id);
        } else if (meal.product && meal.product.cookingInstructions) {
            if (meal.product.cookingInstructions.length === 1) {
                this.selectInstruction(meal.product.cookingInstructions[0], meal.id);
            } else if (meal.product.cookingInstructions.length > 1) {
                // Show choice
                this.activeMealPlanId = meal.id;
                this.availableInstructions = meal.product.cookingInstructions;
                this.selectedRecipe = null;
            }
        }
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
        return ['COOK', 'PHONE', 'TIMERS', 'QUICK_LABEL', 'SCALE', 'HARDWARE', 'INVENTORY_MENU', 'LABELS', 'LABELS_CUSTOM_DATE'].includes(state);
    }

    // Hardware Methods
    openHardware() {
        this.viewState = 'HARDWARE';
        this.status = 'Hardware Check';
        this.startMicTest(); // Auto start? Or wait for user? Let's auto start for convenience, or maybe not to avoid feedback.
        // User asked for a button to show volume level.

        this.isLoadingBridgeVersion = true;
        this.hardwareService.checkBridge().subscribe({
            next: (state) => {
                this.bridgeVersion = state && state.version ? state.version : 'Unknown';
                if (state && state.scales && state.scales.length > 0) {
                    this.scaleInfo = state.scales[0];
                } else {
                    this.scaleInfo = null;
                }
                this.isLoadingBridgeVersion = false;
            },
            error: () => {
                this.bridgeVersion = 'Offline';
                this.scaleInfo = null;
                this.isLoadingBridgeVersion = false;
            }
        });
    }

    closeHardware() {
        this.stopMicTest();
        this.openUtilities();
    }

    testSpeaker() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);

            this.snackBar.open("Playing Sound...", "Close", { duration: 1000 });
        } catch (e) {
            console.error("Audio Play Error", e);
            this.snackBar.open("Audio Error", "Close");
        }
    }

    async toggleMicTest() {
        if (this.micStream) {
            this.stopMicTest();
        } else {
            await this.startMicTest();
        }
    }

    async startMicTest() {
        // Create context immediately on user gesture if possible, or recycle
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.ngZone.run(() => {
                if (this.audioContext?.state === 'suspended') {
                    this.audioContext.resume();
                }

                if (this.audioContext) {
                    const source = this.audioContext.createMediaStreamSource(this.micStream!);
                    this.analyser = this.audioContext.createAnalyser();
                    this.analyser.fftSize = 256;
                    this.analyser.smoothingTimeConstant = 0.3; // More responsive

                    source.connect(this.analyser);

                    console.log("Mic Monitor Started");
                    this.updateMicLevel();
                }
            });
        } catch (e) {
            console.error("Mic Error", e);
            this.snackBar.open("Microphone Access Denied", "Close");
        }
    }

    updateMicLevel() {
        if (!this.analyser || !this.micStream) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const avg = sum / bufferLength;

        this.ngZone.run(() => {
            // Enhanced sensitivity: map 0-50 range to 0-100%
            // Most speech is in lower range of FFT
            let val = (avg / 50) * 100;
            if (val < 5) val = 0; // noise gate

            this.micVolume = Math.min(val, 100);
        });

        this.micFrameId = requestAnimationFrame(this.updateMicLevel.bind(this));
    }

    stopMicTest() {
        if (this.micFrameId) {
            cancelAnimationFrame(this.micFrameId);
            this.micFrameId = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
        this.micVolume = 0;
    }

    // LEFTOVER METHODS
    openLeftovers() {
        if (!this.selectedRecipe) return;
        this.showLeftoverModal = true;
        this.leftoverState = 'OPTIONS';
        this.leftoverQuantity = 1;
        this.leftoverWeight = 0;
        this.leftoverMode = 'QUANTITY';
        this.numpadValue = '';

        // Default expiration (+4 days)
        const d = new Date();
        d.setDate(d.getDate() + 4);
        this.leftoverExpiration = d;
    }

    closeLeftovers() {
        this.showLeftoverModal = false;
        this.stopScaleRead();
    }

    toggleLeftoverMode() {
        if (this.leftoverMode === 'QUANTITY') {
            this.leftoverMode = 'WEIGHT';
            // Start scale if possible
            this.startScaleRead();
        } else {
            this.leftoverMode = 'QUANTITY';
            this.stopScaleRead();
        }
    }

    openLeftoverWeigh() {
        this.leftoverState = 'WEIGH';
        this.startScaleRead();
    }

    openLeftoverQuantityPad() {
        this.leftoverState = 'QUANTITY_PAD';
        this.numpadValue = '';
    }

    openLeftoverExpiration() {
        this.leftoverState = 'EXPIRATION';
    }

    backToLeftoverOptions() {
        this.leftoverState = 'OPTIONS';
        this.stopScaleRead();
    }

    captureLeftoverWeight() {
        this.leftoverWeight = this.currentWeight;
        this.backToLeftoverOptions();
    }

    confirmLeftoverQuantity() {
        const val = parseInt(this.numpadValue);
        if (!isNaN(val) && val > 0) {
            this.leftoverQuantity = val;
        }
        this.backToLeftoverOptions();
    }

    setLeftoverExpiration(val: string) {
        const today = new Date();
        let d: Date | null = new Date();
        d.setHours(0, 0, 0, 0);

        switch (val) {
            case '4d': d.setDate(today.getDate() + 4); break;
            case '1w': d.setDate(today.getDate() + 7); break;
            case '2w': d.setDate(today.getDate() + 14); break;
            case '6m': d.setMonth(today.getMonth() + 6); break;
            case '1y': d.setFullYear(today.getFullYear() + 1); break;
            case '2y': d.setFullYear(today.getFullYear() + 2); break;
            case 'none': d = null; break;
            default: d = null;
        }

        this.leftoverExpiration = d;
        this.backToLeftoverOptions();
    }

    async saveLeftovers(printType: 'NONE' | 'SINGLE' | 'MATCH_QUANTITY') {
        if (!this.selectedRecipe) return;

        const payload: any = {
            trackBy: this.leftoverMode === 'WEIGHT' ? 'weight' : 'quantity'
        };

        if (this.leftoverMode === 'WEIGHT') {
            payload.quantity = this.leftoverWeight > 0 ? this.leftoverWeight : this.currentWeight;
            payload.unit = 'g';
            // Fallback if they didn't capture but hit save on weigh screen (though currentWeight should work)
        } else {
            payload.quantity = this.leftoverQuantity;
        }

        if (this.leftoverExpiration) {
            payload.customExpirationDate = this.leftoverExpiration.toISOString();
        }

        this.status = "Creating Leftovers...";

        try {
            const res = await firstValueFrom(this.http.post<any>(`${this.env.apiUrl}/recipes/${this.selectedRecipe.id}/leftover`, payload));
            const stockItem = res.stockItem;

            if (printType !== 'NONE' && stockItem) {
                this.status = "Printing Label(s)...";
                let printCount = 1;

                if (printType === 'MATCH_QUANTITY' && this.leftoverMode === 'QUANTITY') {
                    printCount = payload.quantity;
                }

                for (let i = 0; i < printCount; i++) {
                    // Add slight delay to avoid buffer overwrites in printer
                    if (i > 0) await new Promise(r => setTimeout(r, 500));
                    this.labelService.printStockLabel(stockItem.id, this.labelSizeCode).subscribe();
                }
            }

            // Sync with Meal Plan if applicable
            if (this.activeMealPlanId) {
                try {
                    await firstValueFrom(this.http.put(`${this.env.apiUrl}/meal-plan/${this.activeMealPlanId}`, {
                        actualYield: payload.quantity
                    }));
                } catch (e) {
                    console.warn("Failed to update meal plan yield", e);
                }
            }

            this.closeLeftovers();
            this.playSuccessSound();
            this.showTempStatus("Leftovers Created", this.selectedRecipe.title, 2000);

        } catch (e) {
            console.error("Leftover creation failed", e);
            this.playErrorSound();
            this.status = "Error";
            this.snackBar.open("Failed to create leftovers", "Close");
        }
    }
}
