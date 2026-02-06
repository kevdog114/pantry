/**
 * Gemini AI Tool Module
 * 
 * This module consolidates all Gemini tool-related code:
 * - toolDefinitions: Schema definitions for Gemini function calling
 * - toolHandlers: Unified execution logic for all tools
 * - toolDisplayNames: UI-friendly names for tool execution
 */

export {
    toolDisplayNames
} from './toolDisplayNames';

export {
    executeToolHandler,
    ToolContext
} from './toolHandlers';

export {
    SchemaType,
    contextToolDefinitions,
    stockToolDefinitions,
    shoppingListToolDefinitions,
    recipeToolDefinitions,
    mealPlanToolDefinitions,
    timerToolDefinitions,
    otherToolDefinitions,
    getAllToolDefinitions,
    getStreamingToolDefinitions
} from './toolDefinitions';
