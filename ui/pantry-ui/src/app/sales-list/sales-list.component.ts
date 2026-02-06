import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SalesService } from '../services/sales.service';
import { RetailerSale } from '../types/sale';

@Component({
    selector: 'app-sales-list',
    standalone: true,
    imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
    templateUrl: './sales-list.component.html',
    styleUrls: ['./sales-list.component.css']
})
export class SalesListComponent implements OnInit {
    sales: RetailerSale[] = [];
    loading = true;
    error: string | null = null;

    constructor(private salesService: SalesService) { }

    ngOnInit(): void {
        this.loadSales();
    }

    loadSales(): void {
        this.loading = true;
        this.error = null;
        this.salesService.getSales().subscribe({
            next: (data) => {
                this.sales = data;
                this.loading = false;
            },
            error: (err) => {
                this.error = 'Failed to load sales data.';
                this.loading = false;
                console.error(err);
            }
        });
    }

    formatPrice(price?: number): string {
        if (price === undefined || price === null) return 'N/A';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
    }
}
