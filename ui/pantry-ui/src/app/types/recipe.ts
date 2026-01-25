import { FileMeta } from "./product";
import { RecipeStep } from "./recipe-step";

export interface Recipe {
    id: number;
    title: string;
    name?: string;
    description: string;
    prepTime?: number | null;
    cookTime?: number | null;
    totalTime?: number | null;
    yield?: string | null;
    steps: RecipeStep[];
    source?: string;
    createdAt?: Date;
    ingredientText?: string;
    ingredients?: {
        id?: number;
        name: string;
        amount?: number;
        unit?: string;
        productId?: number;
        product?: any; // Avoiding circular dependency for now, or use Product type if available
    }[];
    thawInstructions?: string;
    customPrepInstructions?: string;
    prepTasks?: {
        id?: number;
        description: string;
        daysInAdvance: number;
    }[];
    files?: FileMeta[];
    quickActions?: RecipeQuickAction[];
}

export interface RecipeQuickAction {
    id?: number;
    name: string;
    type: string; // "timer"
    value: string;
}

