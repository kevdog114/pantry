
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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

import { KitchenLogisticsService, LogisticsTask } from '../../services/kitchen-logistics.service';

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
        MatDialogModule,
        DragDropModule,
        RouterModule
    ],
    templateUrl: './meal-plan.component.html',
    styleUrls: ['./meal-plan.component.css']
})
export class MealPlanComponent implements OnInit {
    days: Date[] = [];
    mealPlans: { [key: string]: MealPlan[] } = {};
    // Extended type to support UI specific fields if needed, but LogisticsTask should cover most
    dailyPrepTasks: { [key: string]: LogisticsTask[] } = {};
    recipes: Recipe[] = [];
    selectedDate: Date = new Date();
    thawAdviceMap: { [product: string]: { hoursToThaw: number, advice: string } } = {};
    loadingThawAdvice = false;
    highlightedMealPlanId: number | null = null;
    logisticsActive = false;

    constructor(
        private mealPlanService: MealPlanService,
        private recipeService: RecipeService,
        private logisticsService: KitchenLogisticsService, // Injected
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
            this.days.forEach(d => {
                const dateStr = d.toDateString();
                this.mealPlans[dateStr] = [];
            });

            plans.forEach(plan => {
                const planDate = new Date(plan.date);
                const dateKey = planDate.toDateString();

                if (this.mealPlans[dateKey]) {
                    this.mealPlans[dateKey].push(plan);
                } else {
                    // Support for out of view range if needed, or ignore
                    this.mealPlans[dateKey] = [plan];
                }
            });
            this.calculatePrepTasks();
            this.checkThawTimes();
        });
    }

    addMeal(date: Date, recipeId: number, select?: any) {
        console.log('Adding meal:', date, recipeId);
        if (!recipeId) return;

        this.mealPlanService.addMealToPlan(date, recipeId).subscribe({
            next: () => {
                console.log('Meal added successfully');
                this.loadMealPlans();
                this.snackBar.open('Meal added!', 'Close', { duration: 2000 });
                if (select) {
                    select.value = undefined;
                }
            },
            error: (err) => {
                console.error('Error adding meal:', err);
                this.snackBar.open('Failed to add meal', 'Close', { duration: 2000 });
            }
        });
    }

    removeMeal(plan: MealPlan) {
        if (confirm('Remove this meal?')) {
            // Optimistic update
            Object.keys(this.mealPlans).forEach(key => {
                this.mealPlans[key] = this.mealPlans[key].filter(p => p.id !== plan.id);
            });
            this.calculatePrepTasks();

            this.mealPlanService.removeMealFromPlan(plan.id).subscribe(() => {
                // Background update, no need to reload entire list which causes flicker
            });
        }
    }

    getPlansForDate(date: Date): MealPlan[] {
        return this.mealPlans[date.toDateString()] || [];
    }

    getPrepTasksForDate(date: Date): any[] {
        return this.dailyPrepTasks[date.toDateString()] || [];
    }

    checkThawTimes() {
        const productsToThaw = new Set<string>();

        console.log('Checking thaw times...');
        Object.values(this.mealPlans).flat().forEach(plan => {
            const recipe = plan.recipe as any;
            const ingredients = recipe.ingredients || recipe.recipeIngredients; // Handle potential schema naming diff

            if (ingredients) {
                console.log(`Recipe ${recipe.title} (ID: ${recipe.id}) has ${ingredients.length} ingredients.`);
                ingredients.forEach((ing: any) => {
                    const product = ing.product;
                    if (!product) {
                        console.log(' - Ingredient missing product link');
                        return;
                    }
                    if (product.stockItems && product.stockItems.length > 0) {
                        const hasFresh = product.stockItems.some((item: any) => !item.frozen || item.opened);
                        console.log(` - Checking ${product.title}: hasFresh=${hasFresh}, stockCount=${product.stockItems.length}`);
                        if (!hasFresh) {
                            productsToThaw.add(product.title);
                        }
                    } else {
                        console.log(` - Checking ${product.title}: No stock items.`);
                    }
                });
            } else {
                console.log(`Recipe ${recipe.title} (ID: ${recipe.id}) has NO ingredients loaded.`);
            }
        });

        if (productsToThaw.size > 0 && !this.loadingThawAdvice) {
            console.log('Fetching thaw advice for:', Array.from(productsToThaw));
            this.loadingThawAdvice = true;
            this.geminiService.getThawAdvice(Array.from(productsToThaw)).subscribe({
                next: (response: any) => {
                    console.log('Received thaw advice response:', response);

                    // Handle wrapped response from backend
                    const items = Array.isArray(response) ? response : (response.data || []);

                    if (Array.isArray(items)) {
                        items.forEach((item: any) => {
                            // Normalize key to lowercase for robust lookup
                            if (item && item.name) {
                                this.thawAdviceMap[item.name.toLowerCase()] = {
                                    hoursToThaw: item.hoursToThaw,
                                    advice: item.advice
                                };
                            }
                        });
                    } else {
                        console.warn('Unexpected thaw advice response format:', response);
                    }
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
        const recipe = plan.recipe as any;

        // Priority 1: Use pre-calculated AI advice stored on the recipe
        if (recipe.thawInstructions) {
            return recipe.thawInstructions;
        }

        // Priority 2: Fallback to dynamic calculation (Legacy / Fallback)
        let advice: string[] = [];

        if (recipe.ingredients) {
            recipe.ingredients.forEach((ing: any) => {
                const product = ing.product;
                if (product && product.stockItems && product.stockItems.length > 0) {
                    const hasFresh = product.stockItems.some((item: any) => !item.frozen || item.opened);
                    if (!hasFresh) {
                        const cookDate = new Date(plan.date);
                        let thawDate = new Date(cookDate);
                        const thawInfo = this.thawAdviceMap[product.title.toLowerCase()];

                        if (thawInfo && thawInfo.hoursToThaw > 0) {
                            const hours = thawInfo.hoursToThaw;
                            thawDate = new Date(cookDate.getTime() - (hours * 60 * 60 * 1000));
                            const dateStr = thawDate.toLocaleDateString();
                            const timeStr = thawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            advice.push(`${product.title}: Start thawing ${dateStr} ${timeStr}`);
                        } else if (!thawInfo && this.loadingThawAdvice) {
                            advice.push(`${product.title}: Calculating...`);
                        }
                    }
                }
            });
        }
        return advice.length > 0 ? advice.join(' | ') : null;
    }

    getMissingIngredients(plan: MealPlan): string[] {
        const missing: string[] = [];
        const recipe = plan.recipe as any;
        if (recipe.ingredients) {
            recipe.ingredients.forEach((ing: any) => {
                const product = ing.product;
                // If product exists but no stock items, OR product doesn't exist (if that's possible)?
                // Assuming product is the link to stock.
                if (product) {
                    if (!product.stockItems || product.stockItems.length === 0) {
                        missing.push(product.title);
                    }
                } else {
                    // Ingredient might not be linked to a product yet?
                    // In that case we can't check stock. 
                }
            });
        }
        return missing;
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
            this.calculatePrepTasks();

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
    toggleHighlight(mealPlanId: number) {
        if (this.highlightedMealPlanId === mealPlanId) {
            this.highlightedMealPlanId = null;
        } else {
            this.highlightedMealPlanId = mealPlanId;
        }
    }

    calculatePrepTasks() {
        if (this.logisticsActive) {
            // Rerun full service logic locally if we can, OR request full update?
            // Since dragging drops us here, and we only have local visibility,
            // let's try to run the service on the visible meals at least.
            // This prevents "disappearing" tasks for visible meals, though "future" invisible meals might be lost.
            // A better approach: re-run the `runSousChef` fetch? That's heavy.
            // Let's just run generateLogisticsPlan on the current 'mealPlans' map flattened.

            const allVisiblePlans: MealPlan[] = [];
            Object.values(this.mealPlans).forEach(plans => {
                allVisiblePlans.push(...plans);
            });

            // Assume Shopping Date is Today for the recalculation
            const today = new Date();
            const logisticsPlan = this.logisticsService.generateLogisticsPlan(allVisiblePlans, today);

            this.populateDailyTasksFromLogistics(logisticsPlan.tasks);
            return;
        }

        // Reseting map (Basic Mode)
        this.dailyPrepTasks = {};
        this.days.forEach(d => {
            this.dailyPrepTasks[d.toDateString()] = [];
        });

        // 1. Standard Prep Tasks (Legacy/Simple view)
        Object.keys(this.mealPlans).forEach(dateStr => {
            const plans = this.mealPlans[dateStr];
            const currentBucketDate = new Date(dateStr);

            plans.forEach(plan => {
                const recipe = plan.recipe as any;
                if (recipe && recipe.prepTasks) {
                    recipe.prepTasks.forEach((task: any) => {
                        const daysInAdvance = task.daysInAdvance || 0;
                        const actionDate = new Date(currentBucketDate);
                        actionDate.setDate(currentBucketDate.getDate() - daysInAdvance);
                        const actionDateKey = actionDate.toDateString();

                        if (!this.dailyPrepTasks[actionDateKey]) {
                            this.dailyPrepTasks[actionDateKey] = [];
                        }

                        // Map to LogisticsTask interface
                        this.dailyPrepTasks[actionDateKey].push({
                            date: actionDate,
                            type: 'PREP',
                            description: task.description,
                            relatedRecipeTitle: recipe.title,
                            relatedRecipeId: recipe.id,
                            relatedMealPlanId: plan.id,
                            icon: 'content_cut'
                        });
                    });
                }
            });
        });
    }

    runSousChef() {
        this.logisticsActive = true;
        this.snackBar.open("Consulting Sous Chef...", "Close", { duration: 1500 });

        // Fetch 14 days of data
        const today = new Date();
        const future = new Date();
        future.setDate(today.getDate() + 14);

        this.mealPlanService.getMealPlan(today.toISOString(), future.toISOString()).subscribe(plans => {
            // Generate Plan with Shopping Date = TODAY (assuming we shop today)
            const logisticsPlan = this.logisticsService.generateLogisticsPlan(plans, today);

            // Populate Local View
            this.populateDailyTasksFromLogistics(logisticsPlan.tasks);

            // Save to Backend
            this.mealPlanService.saveLogisticsTasks(logisticsPlan.tasks).subscribe({
                next: () => {
                    this.snackBar.open("Logistics Plan Updated & Saved!", "Close", { duration: 2000 });
                },
                error: (err) => {
                    console.error("Failed to save tasks", err);
                    this.snackBar.open("Plan generated but failed to save.", "Close", { duration: 2000 });
                }
            });
        });
    }

    private populateDailyTasksFromLogistics(tasks: any[]) { // Changed type to any[] for simplicity, use LogisticsTask[] if imported
        // Clear current view map
        this.dailyPrepTasks = {};
        this.days.forEach(d => {
            this.dailyPrepTasks[d.toDateString()] = [];
        });

        tasks.forEach(task => {
            const dateKey = task.date.toDateString();
            if (this.dailyPrepTasks[dateKey] !== undefined) {
                // Only populate for days we are viewing
                this.dailyPrepTasks[dateKey].push(task);
            }
        });
    }

    hasPrepTasks(plan: MealPlan): boolean {
        const r = plan.recipe as any;
        return r && r.prepTasks && r.prepTasks.length > 0;
    }
}
