import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { Recipe } from '../types/recipe';
import { RecipeListService } from '../components/recipe-list/recipe-list.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AudioChatDialogComponent } from '../components/audio-chat-dialog/audio-chat-dialog.component';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { LabelService } from '../services/label.service';
import { KioskService } from '../services/kiosk.service';

import { EnvironmentService } from '../services/environment.service';
import { RecipePdfService } from '../services/recipe-pdf.service';

@Component({
    selector: 'app-recipe-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatDividerModule,
        MatDialogModule,
        MatSnackBarModule,
        MatTooltipModule,
        MatMenuModule
    ],
    templateUrl: './recipe-view.component.html',
    styleUrl: './recipe-view.component.scss'
})
export class RecipeViewComponent implements OnInit {
    recipe: Recipe | undefined;
    parsedIngredients: any[] = [];
    qrCodeDataUrl: string = '';
    currentUrl: string = '';
    labelSizeCode: string = 'continuous';
    labelSizeDescription: string = 'Continuous';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private recipeService: RecipeListService,
        private dialog: MatDialog,
        private snackBar: MatSnackBar,
        private labelService: LabelService,
        private kioskService: KioskService,
        private env: EnvironmentService,
        private pdfService: RecipePdfService
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        this.currentUrl = window.location.href;

        this.detectPrinterMedia();

        if (id) {
            this.recipeService.get(parseInt(id)).subscribe({
                next: (r) => {
                    this.recipe = r;
                    this.parseIngredients();
                    this.generateQrCode();
                },
                error: (err) => console.error('Failed to load recipe', err)
            });
        }
    }

    get mainImageUrl(): string | undefined {
        if (this.recipe?.files && this.recipe.files.length > 0) {
            const file = this.recipe.files[0];
            const id = file.id;
            let cacheBuster = "";
            if (file.createdAt) {
                cacheBuster = "&v=" + new Date(file.createdAt).getTime();
            }
            return this.env.apiUrl + "/files/" + id + "?size=medium" + cacheBuster;
        }
        return undefined;
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
                                if (w >= 50) {
                                    this.labelSizeDescription = 'Continuous';
                                    this.labelSizeCode = 'continuous';
                                } else if (w > 0 && w < 30) { // 23mm
                                    this.labelSizeDescription = '23mm Square';
                                    this.labelSizeCode = '23mm'; // matches bridge expectation
                                } else {
                                    this.labelSizeDescription = details.media || 'Continuous';
                                    this.labelSizeCode = 'continuous';
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

    private parseIngredients() {
        // No parsing needed for structured ingredients
    }

    private async generateQrCode() {
        try {
            const QRCode = await import('qrcode');
            this.qrCodeDataUrl = await QRCode.toDataURL(this.currentUrl, { width: 150, margin: 1 });
        } catch (err) {
            console.error('Failed to generate QR code', err);
        }
    }

    printRecipe() {
        window.print();
    }

    downloadPdf() {
        if (this.recipe) {
            this.pdfService.generateFromRecipe(this.recipe);
        }
    }

    printRecipeLabel(size?: string) {
        if (!this.recipe) return;

        const targetSize = size || this.labelSizeCode;

        this.labelService.printRecipeLabel(this.recipe.id, targetSize).subscribe({
            next: (res) => this.snackBar.open(res.message, 'Close', { duration: 3000 }),
            error: (err) => this.snackBar.open('Failed to print label', 'Close', { duration: 3000 })
        });
    }

    openAudioChat() {
        if (this.recipe) {
            this.dialog.open(AudioChatDialogComponent, {
                data: { recipe: this.recipe },
                width: '350px',
                position: { bottom: '100px', right: '30px' },
                hasBackdrop: false,
                panelClass: 'audio-chat-popup-panel'
            });
        }
    }

    deleteRecipe() {
        if (this.recipe && confirm('Are you sure you want to delete this recipe?')) {
            this.recipeService.delete(this.recipe.id).subscribe(() => {
                this.snackBar.open("Successfully deleted the recipe", "Close", { duration: 3000 });
                this.router.navigate(['/recipes']);
            });
        }
    }

    createLeftover() {
        if (!this.recipe) return;
        this.recipeService.createLeftover(this.recipe.id).subscribe({
            next: (res) => {
                this.snackBar.open(`Leftover created: ${res.product.title}`, 'Go to Home', { duration: 5000 })
                    .onAction().subscribe(() => {
                        this.router.navigate(['/']);
                    });
            },
            error: (err) => this.snackBar.open('Failed to create leftover', 'Close', { duration: 3000 })
        });
    }

}
