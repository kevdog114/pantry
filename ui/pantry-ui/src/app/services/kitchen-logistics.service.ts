
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

    // 1. Create Shopping Task
    tasks.push({
      date: shoppingDate,
      type: 'SHOP',
      description: 'Grocery Shopping Day',
      icon: 'shopping_cart'
    });

    mealPlans.forEach(plan => {
      const cookDate = new Date(plan.date);
      const recipe = plan.recipe as any; // Using any to access deep relations if Types not fully up to date

      // Safety: Check nulls
      if (!recipe || !recipe.ingredients) return;

      // 2. Analyze Ingredients for Freeze/Thaw Logic
      recipe.ingredients.forEach((ing: any) => {
        const product = ing.product;
        // console.log(`Checking ingredient: ${ing.name} (Product: ${product?.title}) for Recipe: ${recipe.title}`);

        if (product) {
          // If lifespan is missing, maybe default to high number so we don't freeze unnecessarily?
          // Or just log it.
          const lifespan = product.refrigeratorLifespanDays;

          if (lifespan !== undefined && lifespan !== null) {
            // Calculate Shelf Life Offset
            // Strip time for safety comparison
            const cookDateNoTime = new Date(cookDate.getFullYear(), cookDate.getMonth(), cookDate.getDate());
            const shopDateNoTime = new Date(shoppingDate.getFullYear(), shoppingDate.getMonth(), shoppingDate.getDate());

            const diffTime = cookDateNoTime.getTime() - shopDateNoTime.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            console.log(` - Product: ${product.title}, Lifespan: ${lifespan}, CookDate: ${cookDateNoTime.toDateString()}, ShopDate: ${shopDateNoTime.toDateString()}, DiffDays: ${diffDays}`);

            // Check if we need to freeze (buying too early)
            // Only if cookDate is AFTER shopping date
            if (diffDays > lifespan) {
              console.log(`   -> TRIGGER FREEZE: ${diffDays} > ${lifespan}`);

              // Task: Freeze on Shopping Day
              tasks.push({
                date: shoppingDate,
                type: 'FREEZE',
                description: `Freeze ${product.title} (for ${recipe.title})`,
                relatedRecipeId: recipe.id,
                relatedRecipeTitle: recipe.title,
                relatedMealPlanId: plan.id,
                icon: 'ac_unit' // Blue ice
              });

              // Task: Thaw before cooking
              const thawDate = new Date(cookDate);
              thawDate.setDate(cookDate.getDate() - 1);

              tasks.push({
                date: thawDate,
                type: 'THAW',
                description: `Thaw ${product.title} (for ${recipe.title})`,
                relatedRecipeId: recipe.id,
                relatedRecipeTitle: recipe.title,
                relatedMealPlanId: plan.id,
                icon: 'water_drop' // Water drop
              });
            }
          } else {
            console.log(` - Product ${product.title} has no refrigeratorLifespanDays set.`);
          }
        }
      });

      // 3. Aggregate Prep Tasks (Already existing logic, but maybe we want them in this view too?)
      // The prompt asks to "Render the resulting tasks in the daily view".
      // We can iterate recipe.prepTasks and add them as PREP type.
      if (recipe.prepTasks) {
        recipe.prepTasks.forEach((pt: any) => {
          // Skip static thawing tasks as the Sous Chef engine calculates these dynamically.
          // This prevents duplicate tasks (one from static recipe, one from dynamic logic).
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
            relatedMealPlanId: plan.id,
            icon: 'content_cut'
          });
        });
      }

    });

    // Sort tasks by date
    tasks.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      shoppingList,
      tasks
    };
  }
}
