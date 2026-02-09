/**
 * Display names for Gemini tools.
 * These are shown in the UI while tools are executing.
 */
export const toolDisplayNames: Record<string, string> = {
    // Context Tools
    getWeatherForecast: "Checking weather forecast...",
    getFamilyPreferences: "Checking family dietary preferences...",
    getAvailableEquipment: "Checking available equipment...",
    searchInventory: "Searching inventory...",
    getAllProducts: "Loading product list...",
    getStockExpiringSoon: "Checking expiration dates...",

    // Recipe Tools
    searchRecipes: "Searching recipes...",
    getRecipes: "Searching recipes...",
    getRecipeDetails: "Loading recipe details...",

    // Stock Tools
    getStockEntries: "Loading stock entries...",
    createStockEntry: "Adding stock entry...",
    editStockEntry: "Updating stock entry...",
    deleteStockEntry: "Removing stock entry...",

    // Shopping List Tools
    getShoppingList: "Loading shopping list...",
    addToShoppingList: "Adding to shopping list...",
    updateShoppingListItem: "Updating shopping list item...",
    removeFromShoppingList: "Removing from shopping list...",
    removeShoppingListItemById: "Removing from shopping list...",

    // Meal Plan Tools
    getMealPlan: "Loading meal plan...",
    addToMealPlan: "Adding to meal plan...",
    removeFromMealPlan: "Removing from meal plan...",
    moveMealPlan: "Moving meal plan entry...",

    // Other Tools
    getProducts: "Searching products...",
    createRecipe: "Creating recipe...",
    printReceipt: "Sending to printer...",
    createCookingInstruction: "Saving cooking instructions...",
    sendPushNotification: "Sending notification...",
    getTimers: "Loading timers...",
    createTimer: "Starting timer...",
    deleteTimer: "Stopping timer...",

    // Chat Context Tools
    getFullChatHistory: "Retrieving conversation history...",
    getChatRecipe: "Looking up recipe from this chat..."
};
