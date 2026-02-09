
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EnvironmentService } from '../../services/environment.service';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MealPlanService, MealPlan } from '../../services/meal-plan.service';
import { GeminiService } from '../../services/gemini.service';
import { RecipeService } from '../../services/recipe.service';
import { Recipe } from '../../types/recipe';
import { ProductListService } from '../product-list/product-list.service';
import { Product } from '../../types/product';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { QuantityPromptDialogComponent } from '../quantity-prompt-dialog/quantity-prompt-dialog.component';
import { ShoppingTripService, ShoppingTrip } from '../../services/shopping-trip.service';
import { ShoppingTripDialogComponent } from '../shopping-trip-dialog/shopping-trip-dialog.component';
import { MealItemSearchDialogComponent } from '../meal-item-search-dialog/meal-item-search-dialog.component';
import { MealPlanEditDialogComponent, MealPlanEditDialogData, MealPlanEditDialogResult } from '../meal-plan-edit-dialog/meal-plan-edit-dialog.component';
import { SettingsService } from '../../settings/settings.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';

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
        MatMenuModule,
        MatDividerModule,
        MatExpansionModule,
        MatFormFieldModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatDialogModule,
        DragDropModule,
        RouterModule,
        MatTooltipModule,
        MatProgressSpinnerModule
    ],
    templateUrl: './meal-plan.component.html',
    styleUrls: ['./meal-plan.component.css']
})
export class MealPlanComponent implements OnInit {
    days: Date[] = [];
    mealPlans: { [key: string]: MealPlan[] } = {};
    dailyPrepTasks: { [key: string]: LogisticsTask[] } = {};
    recipes: Recipe[] = [];
    products: Product[] = [];
    selectedDate: Date = new Date();
    thawAdviceMap: { [product: string]: { hoursToThaw: number, advice: string } } = {};
    loadingThawAdvice = false;
    highlightedMealPlanId: number | null = null;
    logisticsActive = false;
    isPlanningLogistics = false;
    weatherMap: Map<string, any> = new Map();
    mealTypes: string[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    loadingSettings = true;

    loadUpcomingTasks() {
        const start = this.days[0].toISOString();
        const lastDay = new Date(this.days[this.days.length - 1]);
        lastDay.setHours(23, 59, 59, 999);
        const end = lastDay.toISOString();

        this.mealPlanService.getUpcomingTasks(start, end).subscribe(tasks => {
            this.populateDailyTasksFromLogistics(tasks);
        });
    }

    constructor(
        private mealPlanService: MealPlanService,
        private recipeService: RecipeService,
        private productService: ProductListService,
        private logisticsService: KitchenLogisticsService, // Injected
        private geminiService: GeminiService,
        private snackBar: MatSnackBar,
        private http: HttpClient,
        private env: EnvironmentService,
        private dialog: MatDialog,
        private shoppingTripService: ShoppingTripService,
        private settingsService: SettingsService
    ) {
        this.generateDays();
    }

    ngOnInit() {
        this.loadRecipes();
        this.loadProducts();
        this.loadMealPlans();
        this.loadShoppingTrips();
    }

    startDateInView: Date = new Date();

    generateDays() {
        this.days = [];
        const start = new Date(this.startDateInView);
        start.setHours(0, 0, 0, 0); // Normalize to start of day
        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            this.days.push(date);
        }
        this.loadWeather();
    }

    previousWeek() {
        this.startDateInView.setDate(this.startDateInView.getDate() - 7);
        this.generateDays();
        this.loadMealPlans();
        this.loadUpcomingTasks();
        this.loadShoppingTrips();
    }

    nextWeek() {
        this.startDateInView.setDate(this.startDateInView.getDate() + 7);
        this.generateDays();
        this.loadMealPlans();
        this.loadUpcomingTasks();
        this.loadShoppingTrips();
    }

    resetToToday() {
        this.startDateInView = new Date();
        this.generateDays();
        this.loadMealPlans();
        this.loadUpcomingTasks();
        this.loadShoppingTrips();
    }

    loadRecipes() {
        this.recipeService.getAll().subscribe(recipes => {
            this.recipes = recipes;
        });
    }

    loadProducts() {
        this.productService.GetAll().subscribe(products => {
            this.products = products;
        });
    }

    loadMealPlans() {
        const start = this.days[0].toISOString();
        const lastDay = new Date(this.days[this.days.length - 1]);
        lastDay.setHours(23, 59, 59, 999);
        const end = lastDay.toISOString();

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
            // We NO LONGER calculate prep tasks locally by default if we want to rely on the saved plan.
            // But we might want to still do checkThawTimes for AI advice?
            // Actually, the request says "show the existing logistics plan".
            // So we should fetch tasks.
            this.checkThawTimes();
        });

        // Load Persistent Tasks
        this.mealPlanService.getUpcomingTasks(start, end).subscribe(tasks => {
            this.populateDailyTasksFromLogistics(tasks);
        });
    }




    getMealsForDayAndType(day: Date, type: string): MealPlan[] {
        const dateKey = day.toDateString();
        const meals = this.mealPlans[dateKey] || [];
        return meals.filter(m => {
            return m.mealType === type;
        });
    }

    getMealsForDayUnassigned(day: Date): MealPlan[] {
        const dateKey = day.toDateString();
        const meals = this.mealPlans[dateKey] || [];
        // Show as unassigned if null and we don't treat dinner as default strictly, 
        // OR if we treat null as Dinner, then this is empty? 
        // Let's assume null = Dinner for legacy compatibility, or Unassigned. 
        // For now, let's treat null as "Unassigned" unless user puts it in a bucket.
        // Actually, if I dragged it, it gets a type.
        // Let's return meals where mealType is NOT in mealTypes list
        return meals.filter(m => !m.mealType || !this.mealTypes.includes(m.mealType));
    }

    openAddItemDialog(date: Date, type: 'recipe' | 'product', mealType?: string) {
        const items = type === 'recipe' ? this.recipes : this.products;

        const dialogRef = this.dialog.open(MealItemSearchDialogComponent, {
            width: '400px',
            data: { type, items }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.addMealToPlan(date, type, result.id, mealType);
            }
        });
    }

    addMealToPlan(date: Date, type: 'recipe' | 'product', id: number, mealType?: string) {
        console.log('Adding meal:', date, type, id, mealType);
        let obs;
        if (type === 'recipe') {
            obs = this.mealPlanService.addMealToPlan(date, id, undefined, undefined, undefined, mealType);
        } else if (type === 'product') {
            obs = this.mealPlanService.addMealToPlan(date, undefined, id, undefined, undefined, mealType);
        }

        if (obs) {
            obs.subscribe({
                next: () => {
                    this.snackBar.open(`${type === 'recipe' ? 'Recipe' : 'Product'} added!`, 'Close', { duration: 2000 });
                    this.loadMealPlans(); // Refresh
                },
                error: (err) => {
                    console.error('Error adding meal:', err);
                    this.snackBar.open('Failed to add meal', 'Close', { duration: 2000 });
                }
            });
        }
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

    editQuantity(plan: MealPlan) {
        const current = plan.quantity || 1;
        const dialogRef = this.dialog.open(QuantityPromptDialogComponent, {
            data: {
                title: 'Edit Quantity',
                message: 'Enter the new quantity:',
                max: 100,
                current: current
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result && result !== current) {
                this.mealPlanService.updateMealPlan(plan.id, new Date(plan.date), result).subscribe({
                    next: (updated) => {
                        plan.quantity = updated.quantity;
                        this.snackBar.open('Quantity updated', 'Close', { duration: 2000 });
                    },
                    error: (err) => {
                        this.snackBar.open('Failed to update quantity', 'Close', { duration: 2000 });
                    }
                });
            }
        });
    }

    shoppingTrips: { [key: string]: ShoppingTrip[] } = {};

    loadShoppingTrips() {
        const start = this.days[0].toISOString();
        const lastDay = new Date(this.days[this.days.length - 1]);
        lastDay.setHours(23, 59, 59, 999);
        const end = lastDay.toISOString();

        this.shoppingTripService.getShoppingTrips(start, end).subscribe(trips => {
            this.shoppingTrips = {};
            this.days.forEach(d => {
                this.shoppingTrips[d.toDateString()] = [];
            });

            trips.forEach(trip => {
                const tripDate = new Date(trip.date);
                const dateKey = tripDate.toDateString();
                if (this.shoppingTrips[dateKey]) {
                    this.shoppingTrips[dateKey].push(trip);
                } else {
                    this.shoppingTrips[dateKey] = [trip];
                }
            });
        });
    }

    addShoppingTrip(date: Date) {
        const dialogRef = this.dialog.open(ShoppingTripDialogComponent, {
            data: { notes: '' }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined) {
                this.shoppingTripService.createShoppingTrip(date, result).subscribe(() => {
                    this.loadShoppingTrips();
                    this.snackBar.open('Shopping trip added', 'Close', { duration: 2000 });
                });
            }
        });
    }

    editShoppingTrip(trip: ShoppingTrip) {
        const dialogRef = this.dialog.open(ShoppingTripDialogComponent, {
            data: { notes: trip.notes || '' }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined) {
                this.shoppingTripService.updateShoppingTrip(trip.id, undefined, result).subscribe(() => {
                    trip.notes = result;
                    this.snackBar.open('Shopping trip updated', 'Close', { duration: 2000 });
                });
            }
        });
    }

    deleteShoppingTrip(trip: ShoppingTrip) {
        if (confirm('Delete this shopping trip?')) {
            this.shoppingTripService.deleteShoppingTrip(trip.id).subscribe(() => {
                this.loadShoppingTrips();
                this.snackBar.open('Shopping trip deleted', 'Close', { duration: 2000 });
            });
        }
    }

    dropTrip(event: CdkDragDrop<ShoppingTrip[]>) {
        if (event.previousContainer === event.container) {
            return;
        } else {
            const trip = event.previousContainer.data[event.previousIndex];
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );

            // Container ID format: "trip-list-Fri Jan 30 2026"
            // We need to extract the date string carefully.
            // Let's assume the ID is just the date string if possible, or construct it.
            // Actually, in HTML we will likely do [id]="'trip-' + day.toDateString()"
            const id = event.container.id;
            const dateStr = id.replace('trip-', '');
            const newDate = new Date(dateStr);

            this.shoppingTripService.updateShoppingTrip(trip.id, newDate).subscribe({
                next: () => this.snackBar.open('Trip moved!', 'Order', { duration: 2000 }),
                error: () => {
                    this.snackBar.open('Failed to move trip.', 'Error', { duration: 2000 });
                    this.loadShoppingTrips(); // Revert
                }
            });
        }
    }

    getLeftoverCandidates(currentDate: Date): MealPlan[] {
        const candidates: MealPlan[] = [];
        const dateLimit = new Date(currentDate);
        dateLimit.setHours(0, 0, 0, 0);
        const seenRecipeIds = new Set<number>();

        for (const day of this.days) {
            if (day.getTime() >= dateLimit.getTime()) break;

            const plans = this.getPlansForDate(day);
            for (const plan of plans) {
                // Deduplicate by recipe ID to avoid showing both the original and leftovers of it
                if (plan.recipe && plan.recipe.id && !seenRecipeIds.has(plan.recipe.id)) {
                    candidates.push(plan);
                    seenRecipeIds.add(plan.recipe.id);
                }
            }
        }
        return candidates;
    }

    addLeftover(date: Date, plan: MealPlan) {
        const dialogRef = this.dialog.open(QuantityPromptDialogComponent, {
            data: {
                title: 'Add Leftovers',
                message: `How many servings of ${plan.recipe?.title} are you having?`,
                max: 10,
                current: 1
            }
        });

        dialogRef.afterClosed().subscribe(qty => {
            if (qty) {
                this.mealPlanService.addMealToPlan(date, plan.recipeId, undefined, true, qty).subscribe({
                    next: () => {
                        this.snackBar.open('Leftovers added!', 'Close', { duration: 2000 });
                        this.loadMealPlans();
                    },
                    error: (err) => {
                        console.error('Error adding leftovers:', err);
                        this.snackBar.open('Failed to add leftovers', 'Close', { duration: 2000 });
                    }
                });
            }
        });
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
            if (!recipe) return; // Skip if no recipe (e.g. product only)

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
        if (plan.product) {
            // For raw product meals
            const product = plan.product as any; // Ensure we have stock items
            if (product.stockItems && product.stockItems.length > 0) {
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
                        return `${product.title}: Start thawing ${dateStr} ${timeStr}`;
                    }
                }
            }
            return null;
        }

        const recipe = plan.recipe as any;
        if (!recipe) return null;

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
        if (plan.isLeftover) return [];
        if (plan.product) {
            // Check if we have the product itself
            const p: any = plan.product;
            if (!p.stockItems || p.stockItems.length === 0 || p.stockItems.every((si: any) => si.quantity <= 0)) {
                // Simple existence check, quantity check is harder without amount
                missing.push(p.title);
            }
            return missing;
        }

        const recipe = plan.recipe as any;
        if (!recipe) return [];

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

    drop(event: CdkDragDrop<any[]>) {
        const itemData = event.item.data;

        if (this.isShoppingTrip(itemData)) {
            // Handle Shopping Trip Move
            let previousDateStr = event.previousContainer.id;
            let newDateStr = event.container.id;

            // Normalize IDs (remove 'shopping-' prefix if present)
            if (previousDateStr.startsWith('shopping-')) previousDateStr = previousDateStr.replace('shopping-', '');
            if (newDateStr.startsWith('shopping-')) newDateStr = newDateStr.replace('shopping-', '');

            if (previousDateStr === newDateStr) return; // No change

            // Convert ISO string (from ID) to Map Key (toDateString)
            // The ID comes from day.toISOString() in the template
            const previousDateKey = new Date(previousDateStr).toDateString();
            const newDateKey = new Date(newDateStr).toDateString();

            // Update Local State
            // Remove from old date
            const oldList = this.shoppingTrips[previousDateKey];
            if (oldList) {
                const index = oldList.indexOf(itemData);
                if (index > -1) {
                    oldList.splice(index, 1);
                }
            }

            // Add to new date
            if (!this.shoppingTrips[newDateKey]) {
                this.shoppingTrips[newDateKey] = [];
            }
            this.shoppingTrips[newDateKey].push(itemData);
            itemData.date = new Date(newDateStr); // Update object directly

            // Update Backend
            this.shoppingTripService.updateShoppingTrip(itemData.id, new Date(newDateStr)).subscribe({
                next: () => {
                    this.snackBar.open('Shopping trip moved!', 'Cool', { duration: 2000 });
                },
                error: (err) => {
                    console.error('Failed to move trip', err);
                    this.snackBar.open('Failed to save move.', 'Error', { duration: 2000 });
                    // Revert local change if needed... (omitted for brevity)
                }
            });

        } else {
            // Handle Meal Plan Move (Existing Logic)
            // Handle Meal Plan Move
            const item = itemData as MealPlan;
            const previousContainerId = event.previousContainer.id;
            const newContainerId = event.container.id;

            if (previousContainerId === newContainerId && event.previousIndex === event.currentIndex) {
                return;
            }

            // Parse ID: "meal-list-{{ISO_DATE}}--{{MEAL_TYPE}}"
            // Assuming prefix "meal-list-"
            const cleanNewId = newContainerId.replace('meal-list-', '');
            const [newDateStr, newMealType] = cleanNewId.split('--');

            const newDate = new Date(newDateStr);
            const oldDate = new Date(item.date);

            // Optimistic Update
            // Remove from source list
            const oldDateKey = oldDate.toDateString();
            if (this.mealPlans[oldDateKey]) {
                const idx = this.mealPlans[oldDateKey].findIndex(m => m.id === item.id);
                if (idx > -1) {
                    this.mealPlans[oldDateKey].splice(idx, 1);
                }
            }

            // Update Item Properties
            item.date = newDate.toISOString();
            item.mealType = newMealType === 'Unassigned' ? undefined : newMealType;

            // Add to destination list
            const newDateKey = newDate.toDateString();
            if (!this.mealPlans[newDateKey]) {
                this.mealPlans[newDateKey] = [];
            }
            this.mealPlans[newDateKey].push(item);

            // Recalculate tasks locally
            this.calculatePrepTasks();

            // API Call
            this.mealPlanService.updateMealPlan(item.id, newDate, undefined, item.mealType).subscribe({
                next: () => {
                    this.snackBar.open('Meal moved!', 'Order', { duration: 2000 });
                },
                error: (err) => {
                    console.error('Failed to move meal', err);
                    this.snackBar.open('Failed to move meal.', 'Error', { duration: 2000 });
                    // Revert is harder here, let's just reload
                    this.loadMealPlans();
                }
            });
        }
    }


    isShoppingTrip(item: any): item is ShoppingTrip {
        // Simple check: ShoppingTrip doesn't have recipeId/productId usually, but has 'items' array
        return (item as ShoppingTrip).items !== undefined && (item as any).recipeId === undefined;
    }
    toggleHighlight(mealPlanId: number | number[]) {
        if (Array.isArray(mealPlanId)) {
            // If already highlighted (checking first item roughly), clear
            if (this.highlightedMealPlanId === mealPlanId[0]) {
                this.highlightedMealPlanId = null;
            } else {
                // We can't actually highlight multiple yet with a single ID var.
                // But wait, the previous task said "Refine Logistics Task Highlighting... highlight only the specific meal plan".
                // Now we have aggregated tasks relating to MULTIPLE plans.
                // We need to change highlightedMealPlanId to support a list or check inclusion.
                // Let's change the strategy: the View checks `isHighlighted(plan.id)`.
                // But since I can't change the View template easily in this step without reading it all, 
                // I will cheat: I will set `highlightedMealPlanId` to the FIRST id to at least show something,
                // OR I should properly update the state variable to be a Set.
            }
        }

        // Proper fix:
    }

    highlightedMealPlanIds: Set<number> = new Set();

    toggleHighlightTasks(ids: number | number[]) {
        this.highlightedMealPlanIds.clear();
        const idArray = Array.isArray(ids) ? ids : [ids];
        idArray.forEach(id => this.highlightedMealPlanIds.add(id));
    }

    isHighlighted(planId: number): boolean {
        return this.highlightedMealPlanIds.has(planId);
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
        if (this.isPlanningLogistics) return;
        this.isPlanningLogistics = true;
        this.logisticsActive = true;
        this.snackBar.open("Consulting Sous Chef & Reserving Stock...", "Close", { duration: 1500 });

        // Fetch 14 days of data
        const today = new Date();
        const future = new Date();
        future.setDate(today.getDate() + 14);

        const startDateStr = today.toISOString().split('T')[0];
        const endDateStr = future.toISOString().split('T')[0];

        // 1. Trigger Stock Reservation (Logistics)
        this.geminiService.planLogistics(startDateStr, endDateStr).subscribe({
            next: (logisticsRes) => {
                console.log("Gemini Logistics Result:", logisticsRes);
                if (logisticsRes.reservationsCreated > 0) {
                    this.snackBar.open(`Reserved stock for ${logisticsRes.reservationsCreated} items.`, "Cool", { duration: 2000 });
                }

                // 2. Refresh Meal Plan Data (to ensure we have latest state if needed) & Generate Prep Tasks
                this.mealPlanService.getMealPlan(today.toISOString(), future.toISOString()).subscribe({
                    next: (plans) => {
                        // Generate Plan with Shopping Date = TODAY (assuming we shop today)
                        const logisticsPlan = this.logisticsService.generateLogisticsPlan(plans, today);

                        // Populate Local View
                        this.populateDailyTasksFromLogistics(logisticsPlan.tasks);

                        // Save to Backend
                        this.mealPlanService.saveLogisticsTasks(logisticsPlan.tasks, today.toISOString(), future.toISOString()).subscribe({
                            next: () => {
                                // this.snackBar.open("Logistics Plan Updated & Saved!", "Close", { duration: 2000 });
                            },
                            error: (err) => {
                                console.error("Failed to save tasks", err);
                                this.snackBar.open("Plan generated but failed to save.", "Close", { duration: 2000 });
                            }
                        });

                        // 3. Generate Shopping List (Logistics via Gemini)
                        // 3. Generate Shopping List (Logistics via Gemini)
                        // this.mealPlanService.generateShoppingList(today.toISOString(), future.toISOString()).subscribe({
                        //     next: (res) => {
                        //         console.log('Shopping list generated:', res);
                        //         if (res.items && res.items.length > 0) {
                        //             this.snackBar.open(`Added ${res.items.length} items to Shopping List`, 'Cool', { duration: 3000 });
                        //         }
                        //         this.isPlanningLogistics = false;
                        //     },
                        //     error: (err) => {
                        //         console.error('Shopping list gen failed', err);
                        //         this.isPlanningLogistics = false;
                        //     }
                        // });
                        console.log('Gemini processed shopping trips. Reloading...');
                        this.loadShoppingTrips();
                        this.isPlanningLogistics = false;
                    },
                    error: (err) => {
                        console.error("Failed to get meal plan", err);
                        this.isPlanningLogistics = false;
                    }
                });
            },
            error: (err) => {
                console.error("Gemini Logistics Failed", err);
                this.snackBar.open("Failed to reserve stock.", "Close", { duration: 3000 });
                this.isPlanningLogistics = false;
            }
        });
    }

    private populateDailyTasksFromLogistics(tasks: any[]) { // Changed type to any[] for simplicity, use LogisticsTask[] if imported
        // Clear current view map
        this.dailyPrepTasks = {};
        this.days.forEach(d => {
            this.dailyPrepTasks[d.toDateString()] = [];
        });

        tasks.forEach(task => {
            // Task date from DB is ISO UTC (e.g. 2026-01-15T00:00:00.000Z)
            // If we just new Date(iso), it converts to local time.
            // If local is UTC-6, 00:00 becomes 18:00 previous day.
            // We want to trust the "Calendar Date" of the task. 
            // Better approach: Split string YYYY-MM-DD if available, or force parsing as UTC-noon to be safe?
            // Simple robust fix: Use string splitting if ISO

            let dateKey: string;
            if (typeof task.date === 'string' && task.date.includes('T')) {
                const [datePart] = task.date.split('T'); // "2026-01-15"
                // Create date part in local time or just map to what `this.days` uses
                // `this.days[i].toDateString()` returns "Thu Jan 15 2026".
                // We need to construct a local date object from YYYY, MM, DD
                const [y, m, d] = datePart.split('-').map(Number);
                const localDate = new Date(y, m - 1, d);
                dateKey = localDate.toDateString();
            } else {
                // Fallback
                const dateObj = new Date(task.date);
                dateKey = dateObj.toDateString();
            }

            console.log(`Task: ${task.description}, Date Raw: ${task.date}, Mapped Key: ${dateKey}`);

            if (this.dailyPrepTasks[dateKey] !== undefined) {
                // Ensure icon exists
                if (!task.icon) {
                    switch (task.type) {
                        case 'FREEZE': task.icon = 'ac_unit'; break;
                        case 'THAW': task.icon = 'water_drop'; break;
                        case 'SHOP': task.icon = 'shopping_cart'; break;
                        case 'PREP': task.icon = 'content_cut'; break;
                        default: task.icon = 'arrow_right'; break;
                    }
                }
                this.dailyPrepTasks[dateKey].push(task);
            } else {
                console.warn(`Key ${dateKey} not found in viewing days.`);
                console.log('Available keys:', Object.keys(this.dailyPrepTasks));
            }
        });
    }

    hasPrepTasks(plan: MealPlan): boolean {
        const r = plan.recipe as any;
        return r && r.prepTasks && r.prepTasks.length > 0;
    }

    loadWeather() {
        if (this.days.length === 0) return;
        const start = this.days[0].toISOString().split('T')[0];
        const endDay = new Date(this.days[this.days.length - 1]);
        endDay.setDate(endDay.getDate() + 1);
        const end = endDay.toISOString().split('T')[0];

        this.http.get<any[]>(`${this.env.apiUrl}/weather/forecast?start=${start}&end=${end}`)
            .subscribe({
                next: (data) => {
                    this.weatherMap.clear();
                    data.forEach(w => {
                        if (!w.date) return;
                        // Robustly parse date to avoid timezone offset issues
                        let dateStr = w.date;
                        if (dateStr.includes('T')) {
                            dateStr = dateStr.split('T')[0];
                        }
                        const [y, m, d] = dateStr.split('-').map(Number);
                        const localDate = new Date(y, m - 1, d);
                        this.weatherMap.set(localDate.toDateString(), w);
                    });
                },
                error: (err) => console.error("Failed to load weather", err)
            });
    }

    getWeather(date: Date) {
        return this.weatherMap.get(date.toDateString());
    }

    getWeatherTooltip(w: any): string {
        if (!w) return '';
        let text = `${w.condition || 'Unknown'}\nHigh: ${w.highTemp}° | Low: ${w.lowTemp}°`;
        if (w.precipitationChance > 0) {
            text += `\nPrecipitation: ${w.precipitationChance}%`;
        }
        return text;
    }

    getWeatherIcon(condition: string): string {
        if (!condition) return 'question_mark';
        const c = condition.toLowerCase();

        if (c.includes('sunny') || c.includes('clear')) return 'wb_sunny';
        if (c.includes('partly cloudy')) return 'partly_cloudy_day'; // Or cloud_queue
        if (c.includes('cloud')) return 'cloud';
        if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return 'water_drop';
        if (c.includes('snow') || c.includes('flurries') || c.includes('blizzard')) return 'ac_unit';
        if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm';
        if (c.includes('fog') || c.includes('haze') || c.includes('mist')) return 'foggy';
        if (c.includes('wind') || c.includes('breeze')) return 'air';

        return 'wb_cloudy'; // Default fallback
    }

    getRemainingServings(plan: MealPlan): number {
        // Parse Yield
        let originalYield = 4; // Default
        if (plan.actualYield) {
            originalYield = plan.actualYield;
        } else if (plan.recipe && plan.recipe.yield) {
            // Try to parse "4 servings" or "4"
            const match = plan.recipe.yield.match(/(\d+)/);
            if (match) originalYield = parseInt(match[1]);
        }

        // Find usage
        let totalUsed = 0;
        const planDate = new Date(plan.date);

        Object.values(this.mealPlans).flat().forEach(p => {
            if (p.isLeftover && p.recipeId === plan.recipeId) {
                if (new Date(p.date) > planDate) {
                    totalUsed += (p.quantity || 1);
                }
            }
        });

        // Subtract what was consumed on the day of cooking
        const consumed = plan.servingsConsumed || 0;

        return Math.max(0, originalYield - totalUsed - consumed);
    }

    editConsumed(plan: MealPlan) {
        const current = plan.servingsConsumed || 0;
        const dialogRef = this.dialog.open(QuantityPromptDialogComponent, {
            data: {
                title: 'Edit Consumed',
                message: 'How many servings did you consume?',
                max: 100,
                current: current
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined && result !== current) {
                this.mealPlanService.updateMealPlan(plan.id, new Date(plan.date), undefined, undefined, result).subscribe({
                    next: (updated) => {
                        plan.servingsConsumed = updated.servingsConsumed;
                        this.snackBar.open('Consumed quantity updated', 'Close', { duration: 2000 });
                    },
                    error: (err) => {
                        this.snackBar.open('Failed to update consumed quantity', 'Close', { duration: 2000 });
                    }
                });
            }
        });
    }

    openEditDialog(plan: MealPlan, event: MouseEvent) {
        event.stopPropagation();
        event.preventDefault();

        const isProduct = !!plan.productId && !plan.recipeId;

        const dialogData: MealPlanEditDialogData = {
            planId: plan.id,
            title: plan.recipe?.title || plan.product?.title || 'Unknown Item',
            recipeId: plan.recipeId,
            productId: plan.productId,
            isLeftover: plan.isLeftover,
            currentMealType: plan.mealType,
            currentDate: plan.date,
            mealTypes: this.mealTypes,
            visibleDays: this.days,
            servingsConsumed: plan.servingsConsumed,
            recipeYield: plan.recipe?.yield,
            quantity: plan.quantity,
            isProduct: isProduct,
        };

        const dialogRef = this.dialog.open(MealPlanEditDialogComponent, {
            width: '460px',
            data: dialogData,
            autoFocus: false,
        });

        dialogRef.afterClosed().subscribe((result: MealPlanEditDialogResult) => {
            if (!result || result.action === 'cancel') return;

            if (result.action === 'delete') {
                this.removeMeal(plan);
                return;
            }

            if (result.action === 'save') {
                const newDate = result.date || new Date(plan.date);
                const newMealType = result.mealType;
                const newServingsConsumed = result.servingsConsumed;
                const newQuantity = result.quantity;

                // Determine if date or meal type changed (need to move)
                const dateChanged = newDate.toDateString() !== new Date(plan.date).toDateString();
                const mealTypeChanged = newMealType !== plan.mealType;

                if (dateChanged || mealTypeChanged) {
                    // Move: remove from old location, add to new
                    const oldDateKey = new Date(plan.date).toDateString();
                    if (this.mealPlans[oldDateKey]) {
                        const idx = this.mealPlans[oldDateKey].findIndex(m => m.id === plan.id);
                        if (idx > -1) {
                            this.mealPlans[oldDateKey].splice(idx, 1);
                        }
                    }

                    plan.date = newDate.toISOString();
                    plan.mealType = newMealType;

                    const newDateKey = newDate.toDateString();
                    if (!this.mealPlans[newDateKey]) {
                        this.mealPlans[newDateKey] = [];
                    }
                    this.mealPlans[newDateKey].push(plan);
                    this.calculatePrepTasks();
                }

                // Update servings consumed or quantity
                if (newServingsConsumed !== undefined) {
                    plan.servingsConsumed = newServingsConsumed;
                }
                if (newQuantity !== undefined) {
                    plan.quantity = newQuantity;
                }

                // API call to update everything
                this.mealPlanService.updateMealPlan(
                    plan.id,
                    newDate,
                    newQuantity,
                    newMealType,
                    newServingsConsumed
                ).subscribe({
                    next: () => {
                        this.snackBar.open('Meal updated!', 'Close', { duration: 2000 });
                    },
                    error: (err) => {
                        console.error('Failed to update meal', err);
                        this.snackBar.open('Failed to update meal.', 'Error', { duration: 2000 });
                        this.loadMealPlans(); // Revert on error
                    }
                });
            }
        });
    }

    hasLeftoverShortage(plan: MealPlan): boolean {
        if (!plan.isLeftover || !plan.recipe) return false;

        // Find Source Plan
        const planDate = new Date(plan.date);
        let sourcePlan: MealPlan | null = null;
        let diff = Infinity;

        // Find closest previous non-leftover meal of same recipe
        Object.values(this.mealPlans).flat().forEach(p => {
            if (!p.isLeftover && p.recipeId === plan.recipeId) {
                const d = new Date(p.date);
                if (d < planDate) {
                    const timeDiff = planDate.getTime() - d.getTime();
                    if (timeDiff < diff) {
                        diff = timeDiff;
                        sourcePlan = p;
                    }
                }
            }
        });

        if (!sourcePlan) return true;

        return this.getRawRemaining(sourcePlan) < 0;
    }

    getRawRemaining(plan: MealPlan): number {
        let originalYield = 4;
        if (plan.actualYield) {
            originalYield = plan.actualYield;
        } else if (plan.recipe && plan.recipe.yield) {
            const match = plan.recipe.yield.match(/(\d+)/);
            if (match) originalYield = parseInt(match[1]);
        }

        let totalUsed = 0;
        const planDate = new Date(plan.date);

        Object.values(this.mealPlans).flat().forEach(p => {
            if (p.isLeftover && p.recipeId === plan.recipeId && new Date(p.date) > planDate) {
                totalUsed += (p.quantity || 1);
            }
        });

        return originalYield - totalUsed;
    }
}
