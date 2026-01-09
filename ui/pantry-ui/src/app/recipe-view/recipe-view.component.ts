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
        MatDialogModule
    ],
    templateUrl: './recipe-view.component.html',
    styleUrl: './recipe-view.component.scss'
})
export class RecipeViewComponent implements OnInit {
    recipe: Recipe | undefined;
    parsedIngredients: string[] = [];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private recipeService: RecipeListService,
        private dialog: MatDialog
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
        if (!this.recipe?.ingredientText) {
            this.parsedIngredients = [];
            return;
        }

        try {
            // Try parsing as JSON first
            const parsed = JSON.parse(this.recipe.ingredientText);
            if (Array.isArray(parsed)) {
                this.parsedIngredients = parsed.map(i => typeof i === 'string' ? i : JSON.stringify(i));
            } else if (typeof parsed === 'object') {
                // If it's an object, maybe keys or values? 
                // For now assume list of strings is what we want.
                this.parsedIngredients = [JSON.stringify(parsed)];
            } else {
                this.parsedIngredients = [String(parsed)];
            }
        } catch (e) {
            // Not JSON, split by newlines as fallback
            this.parsedIngredients = this.recipe.ingredientText.split('\n').filter(line => line.trim().length > 0);
        }
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
                this.router.navigate(['/recipes']);
            });
        }
    }
}
