
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RecipeListService } from '../recipe-list/recipe-list.service';
import { RecipePdfService } from '../../services/recipe-pdf.service';

export interface ChatIngredient {
    name: string;
    amount?: number | string;
    unit?: string;
    productId?: number;
}

export interface ChatRecipe {
    title: string;
    description: string;
    ingredients: ChatIngredient[]; // Changed from string[] to ChatIngredient[]
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
        private recipeService: RecipeListService,
        private snackBar: MatSnackBar,
        private pdfService: RecipePdfService
    ) { }

    toggle() {
        this.expanded = !this.expanded;
    }

    save(event: Event) {
        event.stopPropagation();

        // Parse time strings like "10 minutes" or "1 hour" to numbers
        const parseTime = (timeStr: string): number | undefined => {
            if (!timeStr) return undefined;
            const match = timeStr.match(/(\d+)/);
            if (!match) return undefined;
            let minutes = parseInt(match[1]);
            if (timeStr.toLowerCase().includes('hour')) {
                minutes *= 60;
            }
            return minutes;
        };

        const formatIngredient = (ing: ChatIngredient): string => {
            let part = ing.name;
            if (ing.amount) part += ` - ${ing.amount}`;
            if (ing.unit) part += ` ${ing.unit}`;
            return part;
        };

        const newRecipe = {
            title: this.recipe.title,
            description: this.recipe.description,
            source: 'gemini-pro-latest',
            ingredientText: this.recipe.ingredients.map(formatIngredient).join('\n'),
            ingredients: this.recipe.ingredients, // Pass the structured ingredients
            prepTime: parseTime(this.recipe.time.prep),
            cookTime: parseTime(this.recipe.time.cook),
            totalTime: parseTime(this.recipe.time.total),
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

    downloadPdf(event: Event) {
        event.stopPropagation();
        this.pdfService.generateFromChatRecipe(this.recipe);
    }
}
