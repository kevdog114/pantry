import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CookbookService, Cookbook } from '../services/cookbook.service';
import { RecipeListService } from '../components/recipe-list/recipe-list.service';
import { Recipe } from '../types/recipe';

@Component({
    selector: 'app-cookbook-edit',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        FormsModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatListModule,
        MatFormFieldModule,
        MatInputModule,
        MatSnackBarModule,
        MatDialogModule,
        MatProgressSpinnerModule,
        MatDividerModule,
        MatCheckboxModule
    ],
    templateUrl: './cookbook-edit.component.html',
    styleUrls: ['./cookbook-edit.component.css']
})
export class CookbookEditComponent implements OnInit {
    cookbook: Cookbook | null = null;
    isNew = false;
    name = '';
    saving = false;
    loading = true;

    get cookbookRecipes() {
        return this.cookbook?.recipes || [];
    }

    // For adding recipes
    showRecipeSelector = false;
    allRecipes: Recipe[] = [];
    filteredRecipes: Recipe[] = [];
    selectedRecipeIds: Set<number> = new Set();
    searchingRecipes = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cookbookService: CookbookService,
        private recipeService: RecipeListService,
        private snackBar: MatSnackBar,
        public dialog: MatDialog
    ) { }

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.loadCookbook(parseInt(idParam));
        } else {
            this.isNew = true;
            this.loading = false;
        }
    }

    loadCookbook(id: number): void {
        this.cookbookService.getById(id).subscribe({
            next: (cb) => {
                this.cookbook = cb;
                this.name = cb.name;
                this.loading = false;
            },
            error: () => {
                this.snackBar.open('Failed to load cookbook', 'Close', { duration: 3000 });
                this.router.navigate(['/cookbooks']);
            }
        });
    }

    save(): void {
        if (!this.name.trim() || this.saving) return;
        this.saving = true;

        if (this.isNew) {
            this.cookbookService.create(this.name.trim()).subscribe({
                next: (cb) => {
                    this.snackBar.open(`Created "${cb.name}"`, 'Close', { duration: 3000 });
                    this.router.navigate(['/cookbooks', cb.id]);
                },
                error: () => {
                    this.snackBar.open('Failed to create cookbook', 'Close', { duration: 3000 });
                    this.saving = false;
                }
            });
        } else if (this.cookbook) {
            this.cookbookService.update(this.cookbook.id, this.name.trim()).subscribe({
                next: (cb) => {
                    this.cookbook = cb;
                    this.snackBar.open(`Updated to "${cb.name}"`, 'Close', { duration: 3000 });
                    this.saving = false;
                },
                error: () => {
                    this.snackBar.open('Failed to update cookbook', 'Close', { duration: 3000 });
                    this.saving = false;
                }
            });
        }
    }

    openRecipeSelector(): void {
        this.searchingRecipes = true;
        this.recipeService.getAll({ includeInstructions: false }).subscribe({
            next: (recipes) => {
                this.allRecipes = recipes as Recipe[];
                this.filteredRecipes = this.allRecipes;
                if (this.cookbook?.recipes) {
                    this.cookbook.recipes.forEach(r => this.selectedRecipeIds.add(r.id));
                }
                this.searchingRecipes = false;
                this.showRecipeSelector = true;
            },
            error: () => this.searchingRecipes = false
        });
    }

    filterRecipes(query: string): void {
        if (!query.trim()) {
            this.filteredRecipes = this.allRecipes;
        } else {
            const q = query.toLowerCase();
            this.filteredRecipes = this.allRecipes.filter(r =>
                (r.title || r.name || '').toLowerCase().includes(q) ||
                (r.description || '').toLowerCase().includes(q)
            );
        }
    }

    toggleRecipe(recipeId: number): void {
        if (this.selectedRecipeIds.has(recipeId)) {
            this.selectedRecipeIds.delete(recipeId);
        } else {
            this.selectedRecipeIds.add(recipeId);
        }
    }

    saveRecipes(): void {
        if (!this.cookbook) return;

        const currentIds = new Set((this.cookbook.recipes || []).map(r => r.id));
        const toAdd = [...this.selectedRecipeIds].filter(id => !currentIds.has(id));
        const toRemove = [...currentIds].filter(id => !this.selectedRecipeIds.has(id));

        let operations = 0;
        toAdd.forEach(id => {
            operations++;
            this.cookbookService.addRecipe(this.cookbook!.id, id).subscribe({
                error: () => operations--
            });
        });
        toRemove.forEach(id => {
            operations++;
            this.cookbookService.removeRecipe(this.cookbook!.id, id).subscribe({
                error: () => operations--
            });
        });

        this.showRecipeSelector = false;
        this.snackBar.open('Recipes updated', 'Close', { duration: 2000 });
        if (this.cookbook.id) {
            this.loadCookbook(this.cookbook.id);
        }
    }

    removeRecipe(recipeId: number): void {
        if (!this.cookbook) return;
        this.cookbookService.removeRecipe(this.cookbook.id, recipeId).subscribe({
            next: () => {
                this.loadCookbook(this.cookbook!.id);
                this.snackBar.open('Recipe removed', 'Close', { duration: 2000 });
            },
            error: () => this.snackBar.open('Failed to remove recipe', 'Close', { duration: 3000 })
        });
    }

    cancel(): void {
        this.showRecipeSelector = false;
    }
}
