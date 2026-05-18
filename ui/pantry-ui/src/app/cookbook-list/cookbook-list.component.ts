import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CookbookService, Cookbook } from '../services/cookbook.service';

@Component({
    selector: 'app-cookbook-list',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatListModule,
        MatMenuModule,
        MatRippleModule,
        MatSnackBarModule
    ],
    templateUrl: './cookbook-list.component.html',
    styleUrls: ['./cookbook-list.component.css']
})
export class CookbookListComponent implements OnInit {
    cookbooks: Cookbook[] = [];
    loading = true;

    constructor(
        private cookbookService: CookbookService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.loadCookbooks();
    }

    loadCookbooks(): void {
        this.cookbookService.getAll().subscribe({
            next: (cookbooks) => {
                this.cookbooks = cookbooks;
                this.loading = false;
            },
            error: () => this.loading = false
        });
    }

    deleteCookbook(cookbook: Cookbook): void {
        if (!confirm(`Are you sure you want to delete "${cookbook.name}"?`)) return;
        this.cookbookService.delete(cookbook.id).subscribe({
            next: () => {
                this.cookbooks = this.cookbooks.filter(c => c.id !== cookbook.id);
                this.snackBar.open(`Deleted "${cookbook.name}"`, 'Close', { duration: 3000 });
            },
            error: () => this.snackBar.open('Failed to delete cookbook', 'Close', { duration: 3000 })
        });
    }
}
