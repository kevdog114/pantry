import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { LabelService } from '../services/label.service';
import { KioskService } from '../services/kiosk.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { EnvironmentService } from '../services/environment.service';

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
        private env: EnvironmentService
    ) { }

    ngOnInit(): void {
        this.pantryName = this.env.siteName;

        // Timer for date update
        this.timer = setInterval(() => {
            this.currentDate = new Date();
        }, 60000);

        // Detect printer (reused logic)
        this.detectPrinterMedia();
    }

    ngOnDestroy(): void {
        if (this.timer) clearInterval(this.timer);
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
    }

    goToMealPlan() {
        this.router.navigate(['/meal-plan']);
    }

    openUtilities() {
        this.viewState = 'UTILITIES';
        this.status = 'Utilities';
        this.activeMode = 'NONE';
    }

    closeUtilities() {
        this.viewState = 'MAIN';
        this.status = 'Ready';
        this.activeMode = 'NONE';
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
                // Optionally return to main or stay? User didn't specify. Staying is usually better for multiple prints.
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
        // Need to find shopping list print logic. 
        // For now, placeholder
        this.snackBar.open('Printing shopping list... (Not implemented)', 'Close', { duration: 2000 });
    }

    exitKiosk() {
        this.router.navigate(['/']);
    }
}
