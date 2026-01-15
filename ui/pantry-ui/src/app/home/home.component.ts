import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product } from '../types/product';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatRippleModule } from '@angular/material/core';
import { QuickSnackComponent } from '../components/quick-snack/quick-snack.component';
import { EnvironmentService } from '../services/environment.service';
import { UpcomingTasksWidgetComponent } from './upcoming-tasks-widget/upcoming-tasks-widget.component';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatBottomSheetModule,
        MatRippleModule,
        UpcomingTasksWidgetComponent
    ],
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
    public expiringProducts: Product[] = [];
    public leftoverProducts: Product[] = [];
    public currentDate: Date = new Date();

    public greeting: string = '';
    private timeInterval: any;

    constructor(
        private productService: ProductListService,
        private bottomSheet: MatBottomSheet,
        private env: EnvironmentService
    ) { }

    ngOnInit(): void {
        this.updateTimeAndGreeting();
        this.timeInterval = setInterval(() => {
            this.updateTimeAndGreeting();
        }, 60000); // Update every minute

        this.productService.GetAll().subscribe(products => {
            // Calculate total quantity if not present (backend might not send it)
            // Calculate total quantity and min expiration if not present (backend might not send it)
            products.forEach(p => {
                if (p.stockItems && p.stockItems.length > 0) {
                    if (p.totalQuantity === undefined) {
                        p.totalQuantity = p.stockItems.reduce((acc, item) => acc + item.quantity, 0);
                    }
                    if (!p.minExpiration) {
                        const expirations = p.stockItems
                            .map(i => i.expirationDate ? new Date(i.expirationDate).getTime() : null)
                            .filter(d => d !== null) as number[];

                        if (expirations.length > 0) {
                            p.minExpiration = new Date(Math.min(...expirations));
                        }
                    }
                }
            });

            // Filter for expiring soon (has expiration date) and sort by date
            this.expiringProducts = products
                .filter(p => p.minExpiration)
                .sort((a, b) => new Date(a.minExpiration!).getTime() - new Date(b.minExpiration!).getTime())
                .slice(0, 5);

            // Leftovers
            this.leftoverProducts = products
                .filter(p => p.isLeftover && (p.totalQuantity || 0) > 0)
                .sort((a, b) => {
                    const dateA = a.minExpiration ? new Date(a.minExpiration).getTime() : Infinity;
                    const dateB = b.minExpiration ? new Date(b.minExpiration).getTime() : Infinity;
                    return dateA - dateB;
                });
        });
    }

    ngOnDestroy(): void {
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
        }
    }

    private updateTimeAndGreeting() {
        this.currentDate = new Date();
        const hour = this.currentDate.getHours();
        if (hour < 12) this.greeting = 'Good Morning';
        else if (hour < 18) this.greeting = 'Good Afternoon';
        else this.greeting = 'Good Evening';
    }

    public openQuickSnack() {
        this.bottomSheet.open(QuickSnackComponent);
    }

    public getImageUrl(product: Product): string {
        if (product && product.files && product.files.length > 0)
            return this.env.apiUrl + "/files/" + product.files[0].id + "?size=small";
        else
            return "";
    }
}
