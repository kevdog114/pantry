
import prisma from '../lib/prisma';
import { getAIClient, normalizeToolDefinitions } from '../ai';

const ai = getAIClient();

/**
 * Get the model name for recipe AI tasks.
 * Uses the chat model setting as fallback.
 */
async function getRecipeModel(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'gemini_chat_model' }
    });
    if (setting?.value) {
      const val = setting.value.trim();
      if (val !== 'auto') return val;
    }
  } catch (err) {
    console.warn("Failed to fetch recipe model setting, using default");
  }

  // Default model based on provider
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase().trim();
  return provider === "openai"
    ? (process.env.AI_DEFAULT_MODEL || "google/gemma-4-26b-a4b")
    : "gemini-flash-latest";
}

export async function generateReceiptSteps(recipeTitle: string, ingredients: any[], steps: any[]): Promise<string | null> {
    try {
        const model = await getRecipeModel();

        const ingredientList = ingredients.map(i => `${i.amount || ''} ${i.unit || ''} ${i.name}`).join('\n');
        const stepList = steps.map(s => `${s.instruction}`).join('\n');

        const prompt = `
You are a Culinary Data Architect optimizing recipes for low-width thermal receipt printers. 
Your goal is to convert verbose, unstructured recipe text into a strict, minified JSON schema.
The output MUST be valid JSON.

Recipe Title: ${recipeTitle}

Ingredients:
${ingredientList}

Original Steps:
${stepList}

Follow these compression rules:
1. IMPERATIVE MOOD: Convert sentences like "You should gently fold in the cheese" to "FOLD in cheese".
2. BOLD ACTIONS: Identify the primary action verb (Mix, Whisk, Sear, Bake) for each step.
3. NO FLUFF: Remove all intro text, life stories, and decorative adjectives (e.g., change "luscious, ripe red strawberries" to "strawberries").
4. STANDARDIZE UNITS: Use standard abbreviations (tbsp, tsp, oz, lb, min, hr, F, C).
5. SPLIT NOTES: If a step contains scientific context or tips, separate it into a "note" field so it can be printed in a smaller font.

Output format should be a JSON object with a "steps" key containing an array of objects.
Each object should have:
- "action": The primary bold action verb (e.g. "MIX", "BAKE").
- "text": The rest of the instruction (concise).
- "note": Optional note if applicable.

Example Output JSON:
{
  "steps": [
    { "action": "PREHEAT", "text": "oven to 350F" },
    { "action": "MIX", "text": "flour, sugar, salt in large bowl" },
    { "action": "WHISK", "text": "eggs and milk", "note": "Ensure eggs are room temp" }
  ]
}
`;

        const result = await ai.generateContent(model, [
          { role: "user", parts: [{ text: prompt }] }
        ], {
          responseMimeType: "application/json",
        });

        const text = result.text;

        // Extract JSON from potential markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        let jsonString = jsonMatch ? jsonMatch[1] : text;

        // Validate JSON
        try {
            JSON.parse(jsonString);
            return jsonString;
        } catch (e) {
            console.warn("AI returned invalid JSON for receipt steps", e);
            return null;
        }

    } catch (error) {
        console.error("Error generating receipt steps:", error);
        return null;
    }
}

export async function determineSafeCookingTemps(ingredients: any[]): Promise<{ item: string, temperature: string }[]> {
    try {
        const model = await getRecipeModel();

        const ingredientList = ingredients.map(i => `${i.name}`).join('\n');

        const prompt = `
You are a Food Safety Expert.
Review the following list of ingredients and identify any that require a specific minimum internal cooking temperature for safety (primarily meats, poultry, fish, eggs).
Return the result as a JSON array of objects, where each object has "item" (the ingredient name) and "temperature" (the safe internal temp in Fahrenheit, e.g. "165 F").

If an ingredient does not require a specific safety temperature (e.g. vegetables, flour, spices), ignore it.
If there are no such ingredients, return an empty array.

Ingredients:
${ingredientList}

Example Output JSON:
[
  { "item": "Chicken Breast", "temperature": "165 F" },
  { "item": "Ground Beef", "temperature": "160 F" }
]
`;

        const result = await ai.generateContent(model, [
          { role: "user", parts: [{ text: prompt }] }
        ], {
          responseMimeType: "application/json",
        });

        const text = result.text;

        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        let jsonString = jsonMatch ? jsonMatch[1] : text;

        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data)) {
                return data;
            }
            return [];
        } catch (e) {
            console.warn("AI returned invalid JSON for safe temps", e);
            return [];
        }

    } catch (error) {
        console.error("Error determining safe temps:", error);
        return [];
    }
}

export async function determineQuickActions(recipeTitle: string, ingredients: any[], steps: any[]): Promise<{ name: string, type: string, value: string }[]> {
    try {
        const model = await getRecipeModel();

        const ingredientList = ingredients.map(i => `${i.amount || ''} ${i.unit || ''} ${i.name}`).join('\n');
        const stepList = steps.map(s => `${s.instruction || s.description}`).join('\n');

        const prompt = `
        Analyze the following recipe and identify "Quick Actions" that would be useful for a cook in a kiosk environment.
        Quick Action Types:
        1. "timer": Explicit cooking durations. Value should be in minutes (e.g. "10", "10-12"). 
        2. "weigh": Weighing ingredients. Value should be in grams (e.g. "200", "500").

        Return ONLY a JSON array of objects with 'name', 'type', and 'value'.
        Example: [{"name": "Simmer Sauce", "type": "timer", "value": "20"}, {"name": "Bake Chicken", "type": "timer", "value": "45-50"}, {"name": "Flour", "type": "weigh", "value": "500"}]
        
        Recipe Title: ${recipeTitle}
        Ingredients:
        ${ingredientList}
        Steps:
        ${stepList}
      `;

        const result = await ai.generateContent(model, [
          { role: "user", parts: [{ text: prompt }] }
        ], {
          responseMimeType: "application/json",
        });

        const text = result.text;

        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        let jsonString = jsonMatch ? jsonMatch[1] : text;
        // Basic cleanup of potentially malformed JSON (e.g. trailing commas)
        jsonString = jsonString.trim();

        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data)) {
                return data;
            }
            return [];
        } catch (e) {
            console.warn("AI returned invalid JSON for quick actions", e);
            return [];
        }

    } catch (error) {
        console.error("Error determining quick actions:", error);
        return [];
    }
}
