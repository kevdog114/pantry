/**
 * Tool definitions for Gemini AI.
 * These define the function schemas that Gemini can call.
 */

// SchemaType compatibility - maps old SDK's SchemaType to new SDK's Type
export const SchemaType = {
    OBJECT: "OBJECT",
    STRING: "STRING",
    NUMBER: "NUMBER",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
    ARRAY: "ARRAY"
};

/**
 * Context tools - read-only tools for gathering information
 */
export const contextToolDefinitions = [
    {
        name: "getWeatherForecast",
        description: "Get the weather forecast for the next few days. Useful for meal planning based on weather.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                days: { type: SchemaType.INTEGER, description: "Number of days to forecast (default 5)" }
            }
        }
    },
    {
        name: "getFamilyPreferences",
        description: "Get family member dietary preferences, restrictions, and allergies. ALWAYS call this before recommending recipes.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "getAvailableEquipment",
        description: "Get the list of available cooking equipment and appliances.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "searchInventory",
        description: "Search for products in inventory by name, category, or tag. Returns matching products with their current stock levels.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: "Search term (matches product title or tags)" }
            },
            required: ["query"]
        }
    },
    {
        name: "getAllProducts",
        description: "Get a list of ALL products in the system with their stock levels. Use when you need to browse or see everything available.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "getStockExpiringSoon",
        description: "Get products with stock that will expire within a specified number of days.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                days: { type: SchemaType.INTEGER, description: "Number of days to look ahead (default 7)" }
            }
        }
    }
];

/**
 * Stock management tools
 */
export const stockToolDefinitions = [
    {
        name: "getStockEntries",
        description: "Get a list of stock entries for a specific product. Returns details including ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                productId: { type: SchemaType.INTEGER, description: "ID of the product" }
            },
            required: ["productId"]
        }
    },
    {
        name: "createStockEntry",
        description: "Add a new stock entry for a product.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                productId: { type: SchemaType.INTEGER, description: "ID of the product" },
                quantity: { type: SchemaType.NUMBER, description: "Quantity/Amount" },
                unit: { type: SchemaType.STRING, description: "Unit of measure (e.g. 'grams', 'lbs', 'count')" },
                expirationDate: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
                frozen: { type: SchemaType.BOOLEAN },
                opened: { type: SchemaType.BOOLEAN }
            },
            required: ["productId", "quantity"]
        }
    },
    {
        name: "editStockEntry",
        description: "Update an existing stock entry.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                stockId: { type: SchemaType.INTEGER, description: "ID of the stock item" },
                quantity: { type: SchemaType.NUMBER, nullable: true },
                unit: { type: SchemaType.STRING, nullable: true },
                expirationDate: { type: SchemaType.STRING, nullable: true, description: "YYYY-MM-DD or null to clear" },
                frozen: { type: SchemaType.BOOLEAN, nullable: true },
                opened: { type: SchemaType.BOOLEAN, nullable: true }
            },
            required: ["stockId"]
        }
    },
    {
        name: "deleteStockEntry",
        description: "Delete a stock entry.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                stockId: { type: SchemaType.INTEGER, description: "ID of the stock item" }
            },
            required: ["stockId"]
        }
    }
];

/**
 * Shopping list tools
 */
export const shoppingListToolDefinitions = [
    {
        name: "getShoppingList",
        description: "Get the current shopping list items with their IDs, names, quantities, units, and checked status.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "addToShoppingList",
        description: "Add an item to the shopping list.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                item: { type: SchemaType.STRING, description: "Name of the item" },
                quantity: { type: SchemaType.NUMBER, description: "Quantity" },
                unit: { type: SchemaType.STRING, description: "Unit (e.g. 'pkg', 'oz')" }
            },
            required: ["item"]
        }
    },
    {
        name: "updateShoppingListItem",
        description: "Update a shopping list item by its ID. Can update quantity, unit, name, or checked status.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                itemId: { type: SchemaType.INTEGER, description: "ID of the shopping list item" },
                name: { type: SchemaType.STRING, description: "New name for the item" },
                quantity: { type: SchemaType.NUMBER, description: "New quantity" },
                unit: { type: SchemaType.STRING, description: "New unit" },
                checked: { type: SchemaType.BOOLEAN, description: "Whether the item is checked off" }
            },
            required: ["itemId"]
        }
    },
    {
        name: "removeFromShoppingList",
        description: "Remove an item from the shopping list by item name (partial match).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                item: { type: SchemaType.STRING, description: "Name of the item to remove" }
            },
            required: ["item"]
        }
    },
    {
        name: "removeShoppingListItemById",
        description: "Remove a specific item from the shopping list by its ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                itemId: { type: SchemaType.INTEGER, description: "ID of the item to remove" }
            },
            required: ["itemId"]
        }
    }
];

/**
 * Recipe tools
 */
export const recipeToolDefinitions = [
    {
        name: "getProducts",
        description: "Search for products in inventory by name/keyword. Returns list of matches with IDs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: "Search term" }
            },
            required: ["query"]
        }
    },
    {
        name: "getRecipes",
        description: "Search for recipes by name/keyword. Returns list of matches with IDs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: "Search term" }
            },
            required: ["query"]
        }
    },
    {
        name: "searchRecipes",
        description: "Search for recipes by name/keyword. Returns list of matches with IDs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: "Search term" }
            },
            required: ["query"]
        }
    },
    {
        name: "getRecipeDetails",
        description: "Get full details of a recipe including ingredients and steps.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                recipeId: { type: SchemaType.INTEGER, description: "ID of the recipe" }
            },
            required: ["recipeId"]
        }
    },
    {
        name: "createRecipe",
        description: "Create a new recipe in the recipe book.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING, description: "Title of the recipe" },
                description: { type: SchemaType.STRING, description: "Description or summary" },
                ingredients: {
                    type: SchemaType.ARRAY,
                    description: "List of ingredients",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            name: { type: SchemaType.STRING },
                            amount: { type: SchemaType.NUMBER },
                            unit: { type: SchemaType.STRING },
                            productId: { type: SchemaType.INTEGER, description: "Optional product ID link" }
                        },
                        required: ["name"]
                    }
                },
                steps: {
                    type: SchemaType.ARRAY,
                    description: "Ordered list of instructions",
                    items: { type: SchemaType.STRING }
                },
                prepTime: { type: SchemaType.INTEGER, description: "Prep time in minutes" },
                cookTime: { type: SchemaType.INTEGER, description: "Cook time in minutes" },
                yield: { type: SchemaType.STRING, description: "e.g. '4 servings'" },
                printSteps: {
                    type: SchemaType.ARRAY,
                    description: "Condensed steps for receipt printing",
                    items: { type: SchemaType.STRING }
                }
            },
            required: ["title", "ingredients", "steps"]
        }
    }
];

/**
 * Meal plan tools
 */
export const mealPlanToolDefinitions = [
    {
        name: "getMealPlan",
        description: "Get the meal plan for a date range.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                startDate: { type: SchemaType.STRING, description: "StartDate (YYYY-MM-DD)" },
                endDate: { type: SchemaType.STRING, description: "EndDate (YYYY-MM-DD)" }
            },
            required: ["startDate", "endDate"]
        }
    },
    {
        name: "addToMealPlan",
        description: "Add a recipe OR a product to the meal plan.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                date: { type: SchemaType.STRING, description: "Date (YYYY-MM-DD)" },
                recipeId: { type: SchemaType.INTEGER, description: "ID of the recipe (optional)" },
                productId: { type: SchemaType.INTEGER, description: "ID of the product (optional)" }
            },
            required: ["date"]
        }
    },
    {
        name: "removeFromMealPlan",
        description: "Remove a meal from the plan using its unique plan ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                mealPlanId: { type: SchemaType.INTEGER, description: "ID of the meal plan entry" }
            },
            required: ["mealPlanId"]
        }
    },
    {
        name: "moveMealPlan",
        description: "Move a meal plan entry to a new date.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                mealPlanId: { type: SchemaType.INTEGER },
                newDate: { type: SchemaType.STRING, description: "New Date (YYYY-MM-DD)" }
            },
            required: ["mealPlanId", "newDate"]
        }
    }
];

/**
 * Timer tools
 */
export const timerToolDefinitions = [
    {
        name: "getTimers",
        description: "Get all active timers.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "createTimer",
        description: "Create and start a new timer.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING, description: "Name/label for the timer" },
                durationSeconds: { type: SchemaType.INTEGER, description: "Duration in seconds" }
            },
            required: ["durationSeconds"]
        }
    },
    {
        name: "deleteTimer",
        description: "Delete/stop a timer.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                timerId: { type: SchemaType.INTEGER, description: "ID of the timer" }
            },
            required: ["timerId"]
        }
    }
];

/**
 * Other tools (printing, notifications, cooking instructions)
 */
export const otherToolDefinitions = [
    {
        name: "printReceipt",
        description: "Print a recipe or list to the receipt printer (one call per turn).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING, description: "Title line" },
                text: { type: SchemaType.STRING, description: "Optional body text" },
                items: {
                    type: SchemaType.ARRAY,
                    description: "List items",
                    items: { type: SchemaType.STRING }
                },
                footer: { type: SchemaType.STRING, description: "Footer text" }
            },
            required: ["title"]
        }
    },
    {
        name: "createCookingInstruction",
        description: "Save cooking instructions for a product (e.g., Microwave, Oven methods from package).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                productId: { type: SchemaType.INTEGER, description: "ID of the product" },
                method: { type: SchemaType.STRING, description: "Method label (e.g. 'Microwave', 'Oven')" },
                description: { type: SchemaType.STRING, description: "Brief description" },
                prepTime: { type: SchemaType.INTEGER, description: "Prep time minutes" },
                cookTime: { type: SchemaType.INTEGER, description: "Cook time minutes" },
                steps: {
                    type: SchemaType.ARRAY,
                    description: "Step-by-step instructions",
                    items: { type: SchemaType.STRING }
                }
            },
            required: ["productId", "method", "steps"]
        }
    },
    {
        name: "sendPushNotification",
        description: "Send a push notification to the user's devices.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: { type: SchemaType.STRING, description: "Notification title" },
                body: { type: SchemaType.STRING, description: "Notification body" }
            },
            required: ["title", "body"]
        }
    }
];

/**
 * Get all tool definitions combined for full functionality
 */
export function getAllToolDefinitions() {
    return [
        {
            functionDeclarations: [
                ...contextToolDefinitions,
                ...stockToolDefinitions,
                ...shoppingListToolDefinitions,
                ...recipeToolDefinitions,
                ...mealPlanToolDefinitions,
                ...timerToolDefinitions,
                ...otherToolDefinitions
            ]
        }
    ];
}

/**
 * Get streaming tool definitions (read-only/lightweight subset)
 */
export function getStreamingToolDefinitions() {
    return [
        {
            functionDeclarations: [
                ...contextToolDefinitions,
                // Include shopping list read tools
                {
                    name: "getShoppingList",
                    description: "Get the current shopping list items.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                },
                // Include recipe search
                {
                    name: "searchRecipes",
                    description: "Search recipes by name.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: { query: { type: SchemaType.STRING } }
                    }
                },
                {
                    name: "getRecipeDetails",
                    description: "Get full recipe details.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: { recipeId: { type: SchemaType.INTEGER } },
                        required: ["recipeId"]
                    }
                }
            ]
        }
    ];
}
