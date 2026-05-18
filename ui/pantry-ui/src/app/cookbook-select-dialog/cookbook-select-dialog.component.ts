import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { RouterModule } from '@angular/router';
import { CookbookService, Cookbook } from '../services/cookbook.service';

@Component({
    selector: 'app-cookbook-select-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatCheckboxModule,
        MatCardModule,
        MatIconModule,
        MatDividerModule,
        RouterModule
    ],
    templateUrl: './cookbook-select-dialog.component.html',
    styleUrls: ['./cookbook-select-dialog.component.css']
})
export class CookbookSelectDialogComponent {
    cookbooks: Cookbook[] = [];
    loading = true;
    saving = false;

    constructor(
        public dialogRef: MatDialogRef<CookbookSelectDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { recipeId: number; existingCookbooks: { id: number; name: string }[] },
        private cookbookService: CookbookService
    ) {
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

    ischecked(cookbook: Cookbook): boolean {
        return this.data.existingCookbooks.some(e => e.id === cookbook.id);
    }

    toggleCookbook(cookbook: Cookbook): void {
        if (this.saving) return;
        this.saving = true;
        const isChecked = this.ischecked(cookbook);

        if (isChecked) {
            this.cookbookService.removeRecipe(cookbook.id, this.data.recipeId).subscribe({
                next: () => {
                    this.data.existingCookbooks = this.data.existingCookbooks.filter(e => e.id !== cookbook.id);
                    this.dialogRef.close(`Removed from "${cookbook.name}"`);
                },
                error: () => this.saving = false
            });
        } else {
            this.cookbookService.addRecipe(cookbook.id, this.data.recipeId).subscribe({
                next: () => {
                    this.data.existingCookbooks.push({ id: cookbook.id, name: cookbook.name });
                    this.dialogRef.close(`Added to "${cookbook.name}"`);
                },
                error: () => this.saving = false
            });
        }
    }

    close(): void {
        this.dialogRef.close(null);
    }
}
