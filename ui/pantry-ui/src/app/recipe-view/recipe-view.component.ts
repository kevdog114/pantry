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
        MatSnackBarModule
    ],
    templateUrl: './recipe-view.component.html',
    styleUrl: './recipe-view.component.scss'
})
export class RecipeViewComponent implements OnInit {
    recipe: Recipe | undefined;
    parsedIngredients: any[] = [];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private recipeService: RecipeListService,
        private dialog: MatDialog,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.recipeService.get(parseInt(id)).subscribe({
                next: (r) => {
                    this.recipe = r;
                    this.parseIngredients();
                },
                error: (err) => console.error('Failed to load recipe', err)
            });
        }
    }

    private parseIngredients() {
        // No parsing needed for structured ingredients
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
}
