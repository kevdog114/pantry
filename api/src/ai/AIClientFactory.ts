/**
 * Factory for creating AI client instances based on environment configuration.
 *
 * Environment variables:
 *   AI_PROVIDER    - "gemini" or "openai" (default: "gemini")
 *   AI_API_KEY     - API key for the selected provider
 *   AI_BASE_URL    - Base URL for OpenAI-compatible APIs (required when AI_PROVIDER=openai)
 *   GEMINI_API_KEY - Legacy env var, used as fallback for AI_API_KEY when provider is gemini
 */
import { AIClient } from "./AIClient";
import { GeminiProvider, OpenAIProvider } from "./providers";

let _client: AIClient | null = null;

export function getAIClient(): AIClient {
  if (_client) return _client;

  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase().trim();

  if (provider === "openai") {
    const baseUrl = process.env.AI_BASE_URL;
    if (!baseUrl) {
      throw new Error("AI_BASE_URL is required when AI_PROVIDER=openai");
    }
    const apiKey = process.env.AI_API_KEY || "";
    _client = new OpenAIProvider(baseUrl, apiKey);
  } else {
    // Default: Gemini
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY or AI_API_KEY is required when AI_PROVIDER=gemini");
    }
    _client = new GeminiProvider();
  }

  return _client;
}

/**
 * Reset the cached client (useful for testing).
 */
export function resetAIClient(): void {
  _client = null;
}

/**
 * Convert tool definitions from the existing Gemini format (uppercase types, functionDeclarations wrapper)
 * to our unified ToolDefinition format (lowercase types, flat array).
 *
 * The existing toolDefinitions.ts exports tools in Gemini format.
 * This function normalizes them for use with any provider.
 */
export function normalizeToolDefinitions(geminiTools: any[]): import("./AIClient").ToolDefinition[] {
  const tools: import("./AIClient").ToolDefinition[] = [];

  for (const tool of geminiTools) {
    if (tool.functionDeclarations) {
      for (const fn of tool.functionDeclarations) {
        const params = fn.parametersJsonSchema || fn.parameters || {};
        const normalized = JSON.parse(JSON.stringify(params));
        toLowercaseTypes(normalized);

        tools.push({
          name: fn.name,
          description: fn.description,
          parameters: normalized,
          required: fn.parameters?.required || fn.parametersJsonSchema?.required,
        });
      }
    }
  }

  return tools;
}

function toLowercaseTypes(schema: any): void {
  if (!schema || typeof schema !== "object") return;

  if (schema.type && typeof schema.type === "string") {
    schema.type = schema.type.toLowerCase();
  }

  if (schema.properties) {
    Object.values(schema.properties).forEach((v: any) => toLowercaseTypes(v));
  }
  if (schema.items) {
    toLowercaseTypes(schema.items);
  }
}
