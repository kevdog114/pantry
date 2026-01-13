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
import { environment } from '../../environments/environment';
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
    public recentProducts: Product[] = [];
    public totalProducts: number = 0;
    public totalStock: number = 0;
    public currentDate: Date = new Date();

    constructor(
        private productService: ProductListService,
        private bottomSheet: MatBottomSheet
    ) { }

    ngOnInit(): void {
        this.productService.GetAll().subscribe(products => {
            this.totalProducts = products.length;
            this.totalStock = products.reduce((acc, p) => acc + (p.totalQuantity || 0), 0);

            // Filter for expiring soon (has expiration date) and sort by date
            this.expiringProducts = products
                .filter(p => p.minExpiration)
                .sort((a, b) => new Date(a.minExpiration!).getTime() - new Date(b.minExpiration!).getTime())
                .slice(0, 5);

            // Recent products by ID descending
            this.recentProducts = [...products]
                .sort((a, b) => b.id - a.id)
                .slice(0, 5);
        });
    }

    public openQuickSnack() {
        this.bottomSheet.open(QuickSnackComponent);
    }

    public getImageUrl(product: Product): string {
        if (product && product.files && product.files.length > 0)
            return environment.apiUrl + "/files/" + product.files[0].id + "?size=small";
        else
            return "";
    }

    public getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    }
}
