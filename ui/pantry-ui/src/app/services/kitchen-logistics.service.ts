
import { Injectable } from '@angular/core';
import { Recipe } from '../types/recipe';
import { MealPlan } from './meal-plan.service';

export interface LogisticsTask {
  date: Date;
  type: 'SHOP' | 'FREEZE' | 'THAW' | 'PREP';
  description: string;
  relatedRecipeId?: number;
  relatedRecipeTitle?: string;
  relatedMealPlanId?: number; // Added to distinguish specific meal instance
  relatedMealPlanIds?: number[]; // Added for aggregated tasks
  relatedMealDates?: string[];
  icon?: string;
}

export interface LogisticsPlan {
  shoppingList: string[]; // specific items to buy
  tasks: LogisticsTask[];
}

@Injectable({
  providedIn: 'root'
})
export class KitchenLogisticsService {

  constructor() { }

  generateLogisticsPlan(mealPlans: MealPlan[], shoppingDate: Date): LogisticsPlan {
    const tasks: LogisticsTask[] = [];
    const shoppingList: string[] = [];

    // Temporary storage for aggregation
    // Key: "TYPE_DATE_PRODUCTID" -> Task Data
    // Key: "TYPE_DATE_PRODUCTID" -> Task Data
    const aggregatedTasks = new Map<string, {
      date: Date;
      type: 'FREEZE' | 'THAW';
      productName: string;
      count: number;
      linkedRecipeNames: Set<string>;
      linkedMealDates: Date[];
      relatedMealPlanIds: number[];
      icon: string;
    }>();

    // Helper to get or create a task in the map
    const getOrCreateTask = (date: Date, type: 'FREEZE' | 'THAW', product: any, recipeTitle: string, planId: number, cookDate: Date, amount: number) => {
      const dateStr = date.toISOString().split('T')[0];
      const key = `${type}_${dateStr}_${product.id}`;

      if (!aggregatedTasks.has(key)) {
        aggregatedTasks.set(key, {
          date: date,
          type: type,
          productName: product.title,
          linkedRecipeNames: new Set(),
          linkedMealDates: [],
          relatedMealPlanIds: [],
          count: 0,
          icon: type === 'FREEZE' ? 'ac_unit' : 'water_drop'
        });
      }

      const task = aggregatedTasks.get(key)!;
      task.count += amount; // Accumulate actual amount
      task.linkedRecipeNames.add(recipeTitle);
      task.linkedMealDates.push(cookDate);
      if (planId) task.relatedMealPlanIds.push(planId);

      return task;
    };




    // Track available frozen stock for allocation simulation
    const frozenStockMap = new Map<number, number>();

    // Pre-populate frozen stock from included product data
    // Note: We need to iterate all meals to find products first
    mealPlans.forEach(plan => {
      const recipe = plan.recipe as any;
      if (recipe && recipe.ingredients) {
        recipe.ingredients.forEach((ing: any) => {
          if (ing.product && ing.product.stockItems) {
            // Only count FROZEN stock items
            const frozenQty = ing.product.stockItems
              .filter((item: any) => item.frozen)
              .reduce((sum: number, item: any) => sum + item.quantity, 0);

            // Only set if not already set (avoid overwriting if multiple ingredients point to same product, though it should be same data)
            if (!frozenStockMap.has(ing.product.id)) {
              frozenStockMap.set(ing.product.id, frozenQty);
            }
          }
        });
      }
    });

    mealPlans.forEach(plan => {
      const cookDate = new Date(plan.date);
      const recipe = plan.recipe as any;

      if (!recipe || !recipe.ingredients) return;

      // 2. Analyze Ingredients for Freeze/Thaw Logic
      recipe.ingredients.forEach((ing: any) => {
        const product = ing.product;
        if (product) {
          const qtyNeeded = ing.amount || 0; // Use amount from recipe
          const lifespan = product.refrigeratorLifespanDays;

          if (lifespan !== undefined && lifespan !== null && qtyNeeded > 0) {
            const cookDateNoTime = new Date(cookDate.getFullYear(), cookDate.getMonth(), cookDate.getDate());
            const shopDateNoTime = new Date(shoppingDate.getFullYear(), shoppingDate.getMonth(), shoppingDate.getDate());

            const diffTime = cookDateNoTime.getTime() - shopDateNoTime.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Allocation Logic
            let currentFrozen = frozenStockMap.get(product.id) || 0;

            // 1. Take from Existing Frozen Stock
            const qtyFromFrozen = Math.min(qtyNeeded, currentFrozen);
            if (qtyFromFrozen > 0) {
              // Must Thaw this amount
              const thawDate = new Date(cookDate);
              thawDate.setDate(cookDate.getDate() - 1); // Thaw 1 day before
              getOrCreateTask(thawDate, 'THAW', product, recipe.title, plan.id, cookDate, qtyFromFrozen);

              // Decrement simulated stock
              frozenStockMap.set(product.id, currentFrozen - qtyFromFrozen);
            }

            // 2. Remainder must optionally be Bought & Frozen
            const qtyRemaining = qtyNeeded - qtyFromFrozen;
            if (qtyRemaining > 0) {
              // Determine if we need to freeze these newly bought items
              if (diffDays > lifespan) {
                // Need to Freeze
                getOrCreateTask(shoppingDate, 'FREEZE', product, recipe.title, plan.id, cookDate, qtyRemaining);

                // Need to Thaw (these same items later)
                const thawDate = new Date(cookDate);
                thawDate.setDate(cookDate.getDate() - 1);
                getOrCreateTask(thawDate, 'THAW', product, recipe.title, plan.id, cookDate, qtyRemaining);
              }
              // Else: Keep fresh, no tasks needed
            }
          }
        }
      });

      // 3. Aggregate Prep Tasks 
      if (recipe.prepTasks) {
        recipe.prepTasks.forEach((pt: any) => {
          if (pt.description && (pt.description.toLowerCase().includes('thaw') || pt.description.toLowerCase().includes('defrost'))) {
            return;
          }

          const daysInAdvance = pt.daysInAdvance || 0;
          const prepDate = new Date(cookDate);
          prepDate.setDate(cookDate.getDate() - daysInAdvance);

          tasks.push({
            date: prepDate,
            type: 'PREP',
            description: pt.description,
            relatedRecipeId: recipe.id,
            relatedRecipeTitle: recipe.title,
            relatedMealPlanIds: [plan.id],
            relatedMealDates: [`${cookDate.toLocaleString('default', { month: 'short' })} ${cookDate.getDate()}`],
            icon: 'content_cut'
          });
        });
      }

    });

    // Convert Aggregated Tasks to List
    aggregatedTasks.forEach((val) => {
      const recipeList = Array.from(val.linkedRecipeNames).join(', ');
      const descAction = val.type === 'FREEZE' ? 'Freeze' : 'Thaw';
      // Construct description: "Freeze 2 Chicken Breast (for Recipe A, Recipe B)"
      // Construct description with minimal info as requested for ID separation
      // User asked: "Don't include the recipe name in the task text. include it next to the date beneath it"
      const description = `${descAction} ${val.count} ${val.productName}`;

      // Filter and format unique dates
      const uniqueDates = Array.from(new Set(val.linkedMealDates.map(d => d.toDateString())));
      // We want a shorter format for display, e.g. "Mon"
      const displayDates = val.linkedMealDates.map(d => {
        // Create short date string e.g "Jan 12"
        const m = d.toLocaleString('default', { month: 'short' });
        const day = d.getDate();
        return `${m} ${day}`;
      });
      // De-duplicate strings
      const uniqueDisplayDates = Array.from(new Set(displayDates));

      tasks.push({
        date: val.date,
        type: val.type,
        description: description,
        relatedRecipeTitle: recipeList,
        relatedMealPlanIds: val.relatedMealPlanIds,
        relatedMealDates: uniqueDisplayDates,
        icon: val.icon
      });
    });

    // Sort tasks by date
    tasks.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      shoppingList,
      tasks
    };
  }
}

