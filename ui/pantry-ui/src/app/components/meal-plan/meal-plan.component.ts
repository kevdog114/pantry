
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MealPlanService, MealPlan } from '../../services/meal-plan.service';
import { GeminiService } from '../../services/gemini.service';
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
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

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
        MatDialogModule,
        DragDropModule
    ],
    templateUrl: './meal-plan.component.html',
    styleUrls: ['./meal-plan.component.css']
})
export class MealPlanComponent implements OnInit {
    days: Date[] = [];
    mealPlans: { [key: string]: MealPlan[] } = {};
    recipes: Recipe[] = [];
    selectedDate: Date = new Date();
    thawAdviceMap: { [product: string]: { hoursToThaw: number, advice: string } } = {};
    loadingThawAdvice = false;

    constructor(
        private mealPlanService: MealPlanService,
        private recipeService: RecipeService,

        private geminiService: GeminiService,
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
            // Initialize all days
            this.mealPlans = {};
            this.days.forEach(d => this.mealPlans[d.toDateString()] = []);

            plans.forEach(plan => {
                const dateKey = new Date(plan.date).toDateString();
                // We use toDateString() as key, but plan.date is ISO string or Date object from JSON?
                // The service returns JSON, so plan.date is string. 
                // However, new Date(plan.date) handles it.
                // NOTE: Timezone issues might occur if backend returns UTC and we assume local in `toDateString`.
                // But for now let's stick to existing logic.
                if (this.mealPlans[dateKey]) {
                    this.mealPlans[dateKey].push(plan);
                } else {
                    // Fallback if date mismatch (e.g. out of range or diff timezone day)
                    this.mealPlans[dateKey] = [plan];
                }
            });
            this.checkThawTimes();
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

    checkThawTimes() {
        const productsToThaw = new Set<string>();

        Object.values(this.mealPlans).flat().forEach(plan => {
            const recipe = plan.recipe as any;
            if (recipe.ingredients) {
                recipe.ingredients.forEach((ing: any) => {
                    const product = ing.product;
                    if (product && product.stockItems && product.stockItems.length > 0) {
                        const hasFresh = product.stockItems.some((item: any) => !item.frozen || item.opened);
                        if (!hasFresh) {
                            // Needs thawing
                            productsToThaw.add(product.title);
                        }
                    }
                });
            }
        });

        if (productsToThaw.size > 0 && !this.loadingThawAdvice) {
            this.loadingThawAdvice = true;
            this.geminiService.getThawAdvice(Array.from(productsToThaw)).subscribe({
                next: (items: any[]) => {
                    items.forEach(item => {
                        this.thawAdviceMap[item.name] = {
                            hoursToThaw: item.hoursToThaw,
                            advice: item.advice
                        };
                    });
                    this.loadingThawAdvice = false;
                },
                error: (err) => {
                    console.error("Failed to get thaw advice", err);
                    this.loadingThawAdvice = false;
                }
            });
        }
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
                        const cookDate = new Date(plan.date);
                        let thawDate = new Date(cookDate);

                        const thawInfo = this.thawAdviceMap[product.title];

                        if (thawInfo && thawInfo.hoursToThaw > 0) {
                            // Use Gemini's advice
                            const hours = thawInfo.hoursToThaw;
                            // set thawDate back by 'hours'
                            thawDate = new Date(cookDate.getTime() - (hours * 60 * 60 * 1000));

                            // Format: Thaw starting MM/DD (Previous day if needed)
                            const dateStr = thawDate.toLocaleDateString();
                            const timeStr = thawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            advice.push(`Thaw ${product.title} starting ${dateStr} ${timeStr} (${thawInfo.advice})`);
                        } else if (!this.loadingThawAdvice) {
                            // Default fallback if gemini failed or not loaded yet, OR gemini said 0 hours (which we skip)
                            // If gemini specifically said 0 hours (no thaw needed), we shouldn't show default advice.
                            // But if we don't have info yet, maybe show generic? 
                            // Let's assume generic 24h until we know better IF we haven't loaded yet.
                            // But wait, if thawInfo is missing, maybe we shouldn't show anything?
                            // or show "Calculating..."?
                            if (!thawInfo) {
                                thawDate.setDate(cookDate.getDate() - 1);
                                advice.push(`Thaw ${product.title} (Calculating time...)`);
                            }
                        }
                    }
                }
            });
        }

        return advice.length > 0 ? advice.join('. ') : null;
    }

    drop(event: CdkDragDrop<MealPlan[]>) {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const item = event.previousContainer.data[event.previousIndex];
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );

            // Update Backend
            const newDateStr = event.container.id; // We will use date string as ID
            const newDate = new Date(newDateStr);
            this.mealPlanService.updateMealPlan(item.id, newDate).subscribe({
                next: () => {
                    this.snackBar.open('Meal moved!', 'Order', { duration: 2000 });
                },
                error: () => {
                    this.snackBar.open('Failed to move meal.', 'Error', { duration: 2000 });
                    // Revert? simpler to just reload or let it be for now (optimistic UI)
                }
            });
        }
    }
}
