
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MealPlanService, MealPlan } from '../../services/meal-plan.service';
import { RecipeService } from '../../services/recipe.service';
import { Recipe } from '../../types/recipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'app-meal-plan',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatSelectModule,
        MatFormFieldModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatDialogModule
    ],
    templateUrl: './meal-plan.component.html',
    styleUrls: ['./meal-plan.component.css']
})
export class MealPlanComponent implements OnInit {
    days: Date[] = [];
    mealPlans: { [key: string]: MealPlan[] } = {};
    recipes: Recipe[] = [];
    selectedDate: Date = new Date();

    constructor(
        private mealPlanService: MealPlanService,
        private recipeService: RecipeService,
        private snackBar: MatSnackBar
    ) {
        this.generateDays();
    }

    ngOnInit() {
        this.loadRecipes();
        this.loadMealPlans();
    }

    generateDays() {
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            this.days.push(date);
        }
    }

    loadRecipes() {
        this.recipeService.getAll().subscribe(recipes => {
            this.recipes = recipes;
        });
    }

    loadMealPlans() {
        const start = this.days[0].toISOString();
        const end = this.days[this.days.length - 1].toISOString();

        this.mealPlanService.getMealPlan(start, end).subscribe(plans => {
            this.mealPlans = {};
            plans.forEach(plan => {
                const dateKey = new Date(plan.date).toDateString();
                if (!this.mealPlans[dateKey]) {
                    this.mealPlans[dateKey] = [];
                }
                this.mealPlans[dateKey].push(plan);
            });
        });
    }

    addMeal(date: Date, recipeId: number) {
        if (!recipeId) return;

        this.mealPlanService.addMealToPlan(date, recipeId).subscribe(() => {
            this.loadMealPlans();
            this.snackBar.open('Meal added!', 'Close', { duration: 2000 });
        });
    }

    removeMeal(id: number) {
        if (confirm('Remove this meal?')) {
            this.mealPlanService.removeMealFromPlan(id).subscribe(() => {
                this.loadMealPlans();
            });
        }
    }

    getPlansForDate(date: Date): MealPlan[] {
        return this.mealPlans[date.toDateString()] || [];
    }

    // Thawing Logic
    getThawingAdvice(plan: MealPlan): string | null {
        // Logic: Check if any ingredient is solely frozen
        // Ideally we need stock info.
        // The backend MealPlanController includes recipe.ingredients.product.stockItems
        // So we can check valid stock.

        let advice: string[] = [];
        const recipe = plan.recipe as any; // Cast to access included relations if typescript types aren't full

        if (recipe.ingredients) {
            recipe.ingredients.forEach((ing: any) => {
                const product = ing.product;
                if (product && product.stockItems && product.stockItems.length > 0) {
                    // Check if we have any FRESH or OPENED stock
                    const hasFresh = product.stockItems.some((item: any) => !item.frozen || item.opened);

                    if (!hasFresh) {
                        // Only frozen stock available
                        // Assuming 24h thaw time
                        const cookDate = new Date(plan.date);
                        const thawDate = new Date(cookDate);
                        thawDate.setDate(cookDate.getDate() - 1);
                        advice.push(`Thaw ${product.title} starting ${thawDate.toLocaleDateString()}`);
                    }
                } else {
                    // No stock at all? maybe warn? But user asked for thaw logic.
                }
            });
        }

        return advice.length > 0 ? advice.join('. ') : null;
    }
}
