export interface Recipe {
    id: number;
    title: string;
    description: string;
    prepTime?: number | null;
    cookTime?: number | null;
    totalTime?: number | null;
    yield?: string | null;
}
