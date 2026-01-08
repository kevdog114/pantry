
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RecipeService } from '../../services/recipe.service';

export interface ChatRecipe {
    title: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    time: {
        prep: string;
        cook: string;
        total: string;
    };
}

@Component({
    selector: 'app-recipe-card',
    templateUrl: './recipe-card.component.html',
    styleUrls: ['./recipe-card.component.scss'],
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule]
})
export class RecipeCardComponent {
    @Input() recipe!: ChatRecipe;
    @Input() expanded: boolean = false;

    constructor(
        private recipeService: RecipeService,
        private snackBar: MatSnackBar
    ) { }

    toggle() {
        this.expanded = !this.expanded;
    }

    save(event: Event) {
        event.stopPropagation();

        const newRecipe = {
            title: this.recipe.title,
            description: this.recipe.description,
            source: 'gemini-pro-latest',
            ingredients: this.recipe.ingredients,
            steps: this.recipe.instructions.map((inst: string) => ({ description: inst }))
        };

        this.recipeService.create(newRecipe).subscribe({
            next: (res) => {
                this.snackBar.open('Recipe saved successfully!', 'Close', { duration: 3000 });
            },
            error: (err) => {
                this.snackBar.open('Failed to save recipe.', 'Close', { duration: 3000 });
                console.error(err);
            }
        });
    }
}
