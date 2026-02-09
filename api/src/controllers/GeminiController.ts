// New SDK that properly exposes thoughtSignature
// Using dynamic import since @google/genai is ESM-only
import * as crypto from "crypto";
import dotenv from "dotenv";
import { Request, Response } from "express";
import prisma from '../lib/prisma';
import { UploadedFile } from "express-fileupload";
import * as fs from "fs";
import * as path from "path";
import { storeFile, UPLOAD_DIR } from "../lib/FileStorage";
import { intentEngine } from "../lib/IntentEngine";
import { WeatherService } from "../services/WeatherService";
import { determineQuickActions, generateReceiptSteps, determineSafeCookingTemps } from "../services/RecipeAIService";
import { sendNotificationToUser } from "./PushController";
import {
  toolDisplayNames as sharedToolDisplayNames,
  getAllToolDefinitions,
  executeToolHandler,
  ToolContext
} from "../gemini";

dotenv.config();

const gemini_api_key = process.env.GEMINI_API_KEY;
if (!gemini_api_key) {
  throw new Error("GEMINI_API_KEY is not set");
}

// Lazy-loaded SDK instances (ESM module requires dynamic import)
let _ai: any = null;
let _Type: any = null;

async function getAI(): Promise<any> {
  if (!_ai) {
    const { GoogleGenAI, Type } = await import("@google/genai");
    _ai = new GoogleGenAI({ apiKey: gemini_api_key });
    _Type = Type;
  }
  return _ai;
}

async function getType(): Promise<any> {
  if (!_Type) {
    await getAI(); // This also initializes _Type
  }
  return _Type;
}

// SchemaType compatibility - maps old SDK's SchemaType to new SDK's Type
// This allows existing code using SchemaType.OBJECT, SchemaType.STRING, etc. to work
const SchemaType = {
  OBJECT: "OBJECT",
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY"
};

// Content type for history/messages
type Content = {
  role: string;
  parts: any[];
};

const DEFAULT_FALLBACK_MODEL = "gemini-flash-latest";
// Models that support caching (flash models generally support it)
const CACHE_SUPPORTED_MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-flash-latest", "gemini-3-pro-preview"];

// Auto model routing
const AUTO_MODEL = "auto";
const ROUTER_MODEL_SETTING = "gemini_router_model";
const DEFAULT_ROUTER_MODEL = "gemini-flash-latest";
const PRO_MODEL_SETTING = "gemini_pro_model";
const DEFAULT_PRO_MODEL = "gemini-3-pro-preview";

// In-memory cache reference to avoid repeated API calls
let currentCacheName: string | null = null;
let currentCacheHash: string | null = null;
let cacheExpiresAt: Date | null = null;

const geminiConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 4096,
};

// Helper to get the model name based on feature setting or fallback
export async function getModelName(featureKey: string, fallbackModelName: string = DEFAULT_FALLBACK_MODEL): Promise<string> {
  let modelName = fallbackModelName;
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: featureKey }
    });
    // If setting exists and is NOT "auto", use it. If "auto", we stick to fallback (Flash)
    // "auto" is handled specially in the streaming endpoint with routing logic
    if (setting && setting.value) {
      const val = setting.value.trim();
      if (val !== AUTO_MODEL) modelName = val;
    }
  } catch (err) {
    console.warn(`Failed to fetch setting for ${featureKey}, using default: ${modelName}`, err);
  }
  return modelName;
}

// Legacy compatibility - creates a model-like wrapper for old code that expects model.generateContent()
export async function getGeminiModel(featureKey: string, fallbackModelName: string = DEFAULT_FALLBACK_MODEL) {
  const modelName = await getModelName(featureKey, fallbackModelName);
  const ai = await getAI();
  const Type = await getType();

  // Return a wrapper object that mimics the old SDK's model interface
  return {
    model: {
      generateContent: async (request: any) => {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: request.contents || request,
          config: {
            ...geminiConfig,
            systemInstruction: request.systemInstruction,
            tools: adaptTools(request.tools)
          }
        });
        return response;
      },
      generateContentStream: async (request: any) => {
        const response = await ai.models.generateContentStream({
          model: modelName,
          contents: request.contents || request,
          config: {
            ...geminiConfig,
            systemInstruction: request.systemInstruction,
            tools: adaptTools(request.tools)
          }
        });
        return response;
      }
    },
    modelName
  };
}

// Reuseable execution wrapper with fallback
export async function executeWithFallback<T>(
  featureKey: string,
  operation: (model: any) => Promise<T>,
  fallbackModelName: string = DEFAULT_FALLBACK_MODEL
): Promise<{ result: T; warning?: string }> {
  const { model, modelName } = await getGeminiModel(featureKey, fallbackModelName);

  try {
    const result = await operation(model);
    return { result };
  } catch (error: any) {
    console.warn(`Error using model ${modelName}:`, error);

    if (modelName !== fallbackModelName) {
      console.warn(`Attempting fallback to ${fallbackModelName}`);
      const { model: fallbackModel } = await getGeminiModel(featureKey, fallbackModelName);
      try {
        const result = await operation(fallbackModel);
        return {
          result,
          warning: `Preferred model '${modelName}' was unavailable. Fell back to '${fallbackModelName}'.`
        };
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw error;
  }
}

/**
 * Optimized Router: Uses Flash to attempt a direct answer.
 * If Flash outputs the escalation token, it discards the stream and switches to Pro.
 * Otherwise, it streams the Flash response directly.
 */
/**
 * Optimized Router: Uses Flash to attempt a direct answer.
 * If Flash outputs the escalation token, it discards the stream and switches to Pro.
 * Otherwise, it streams the Flash response directly.
 */
async function routeAndExecute(
  sessionId: number,
  systemInstruction: string,
  contents: Content[],
  tools: any[],
  geminiConfig: any,
  additionalContext?: string
): Promise<{ streamResult: any; finalModelName: string }> {
  const ai = await getAI();

  // 1. Resolve Model Names
  let routerModelName = DEFAULT_ROUTER_MODEL;
  let proModelName = DEFAULT_PRO_MODEL;

  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [ROUTER_MODEL_SETTING, PRO_MODEL_SETTING] } }
    });

    const routerSetting = settings.find(s => s.key === ROUTER_MODEL_SETTING);
    if (routerSetting?.value) routerModelName = routerSetting.value;

    const proSetting = settings.find(s => s.key === PRO_MODEL_SETTING);
    if (proSetting?.value) proModelName = proSetting.value;
  } catch (err) {
    console.warn("Failed to get routing model settings, using defaults");
  }

  // 2. Prepare Router (Flash) with escalation instruction
  const ESCALATION_TOKEN = "[[ROUTER_ESCALATE]]";
  const SUMMARY_TAG = "summary";

  const routingInstruction = `
[INTERNAL ROUTING INSTRUCTION]
You are acting as the primary responder. Analyze the user request.
If it requires complex reasoning, advanced creative writing, or capabilities beyond a standard efficient model:
1. Output the token "${ESCALATION_TOKEN}" immediately.
2. On a new line, provide a comprehensive summary of the entire chat session up to this point (<${SUMMARY_TAG}>...</${SUMMARY_TAG}>).

Otherwise:
1. Answer the request directly and helpfully as the assistant.
2. Provide the summary (<${SUMMARY_TAG}>...</${SUMMARY_TAG}>) at the very end.

Example Summary Format:
<${SUMMARY_TAG}>User asked x, I provided y.</${SUMMARY_TAG}>

${systemInstruction}`;

  console.log(`[Auto Router] Attempting direct answer with ${routerModelName}...`);

  try {
    // 3. Start Flash Stream using new SDK
    const routerStreamResult = await ai.models.generateContentStream({
      model: routerModelName,
      contents,
      config: {
        ...geminiConfig,
        systemInstruction: routingInstruction,
        tools: adaptTools(tools)
      }
    });

    // 4. Robust Peeking: Buffer chunks until we have enough text to check for escalation or confirm regular response
    const iterator = routerStreamResult[Symbol.asyncIterator]();
    let accumulatedText = "";
    const bufferedResults: any[] = [];
    let isEscalating = false;

    // Helper to safely extract text from a chunk without triggering SDK warning
    const safeChunkText = (chunk: any): string => {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts) {
        return parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      }
      return typeof chunk.text === 'string' ? chunk.text : '';
    };

    // Helper to check if a chunk has function calls
    const hasFunctionCalls = (chunk: any): boolean => {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (parts) return parts.some((p: any) => p.functionCall);
      return !!(chunk.functionCalls && chunk.functionCalls.length > 0);
    };

    // Buffer up to ~50 chars or until we see the token.
    while (true) {
      const next = await iterator.next();
      if (next.done) break;

      bufferedResults.push(next);
      accumulatedText += safeChunkText(next.value);

      if (accumulatedText.includes(ESCALATION_TOKEN)) {
        isEscalating = true;
        break;
      }

      if (accumulatedText.trimStart().length > 50) break;
    }

    // Helper to extract and save summary
    const saveSummaryFromText = async (text: string) => {
      if (text.includes(`<${SUMMARY_TAG}>`)) {
        let summaryContent = text.replace(new RegExp(`.*?<${SUMMARY_TAG}>`, 's'), '');
        if (summaryContent.includes(`</${SUMMARY_TAG}>`)) {
          summaryContent = summaryContent.split(`</${SUMMARY_TAG}>`)[0];
        }
        summaryContent = summaryContent.trim();

        if (summaryContent) {
          console.log(`[Auto Router] Extracted Summary: "${summaryContent.substring(0, 50)}..."`);
          try {
            await prisma.chatSummary.upsert({
              where: { sessionId: sessionId },
              update: { summary: summaryContent },
              create: { sessionId: sessionId, summary: summaryContent }
            });
            console.log("[Auto Router] Summary saved to DB.");
          } catch (dbErr) {
            console.error("[Auto Router] Failed to save summary:", dbErr);
          }
        }
      }
    };

    // 5. Check for Escalation Token
    if (isEscalating) {
      console.log(`[Auto Router] Escalation token detected. Switching to Pro (${proModelName}).`);

      // Start Pro Stream
      const proStreamResult = await ai.models.generateContentStream({
        model: proModelName,
        contents,
        config: {
          ...geminiConfig,
          systemInstruction, // Use original instruction without routing directive
          tools: adaptTools(tools)
        }
      });

      // BACKGROUND: Continue consuming Flash stream to get summary
      (async () => {
        try {
          console.log("[Auto Router] Background: Consuming Flash stream for summary...");
          let buffer = accumulatedText;
          let next = await iterator.next();
          while (!next.done) {
            buffer += safeChunkText(next.value);
            next = await iterator.next();
          }
          await saveSummaryFromText(buffer);
        } catch (e) { /* ignore stream errors in background */ }
      })();

      return { streamResult: proStreamResult, finalModelName: proModelName };
    }

    // 6. Direct Answer - Reconstruct Stream AND Filter Summary
    console.log(`[Auto Router] Flash accepted request. Streaming directly. Buffer size: ${bufferedResults.length}`);

    async function* combinedStream() {
      let streamBuffer = "";

      const processChunk = (text: string) => {
        streamBuffer += text;
        const openTagIndex = streamBuffer.indexOf(`<${SUMMARY_TAG}>`);

        if (openTagIndex !== -1) {
          const yieldable = streamBuffer.substring(0, openTagIndex);
          streamBuffer = streamBuffer.substring(openTagIndex);
          return yieldable;
        } else {
          const lastOpen = streamBuffer.lastIndexOf('<');
          if (lastOpen !== -1 && streamBuffer.length - lastOpen < 10) {
            const yieldable = streamBuffer.substring(0, lastOpen);
            streamBuffer = streamBuffer.substring(lastOpen);
            return yieldable;
          } else {
            const yieldable = streamBuffer;
            streamBuffer = "";
            return yieldable;
          }
        }
      };

      for (const result of bufferedResults) {
        const text = safeChunkText(result.value);
        const safeText = processChunk(text);
        const hasFc = hasFunctionCalls(result.value);
        if (safeText || hasFc) {
          yield {
            text: safeText,
            candidates: result.value.candidates,
            functionCalls: result.value.functionCalls
          } as any;
        }
      }

      let next = await iterator.next();
      while (!next.done) {
        const text = safeChunkText(next.value);
        const safeText = processChunk(text);
        const hasFc = hasFunctionCalls(next.value);
        if (safeText || hasFc) {
          yield {
            text: safeText,
            candidates: next.value.candidates,
            functionCalls: next.value.functionCalls
          } as any;
        }
        next = await iterator.next();
      }

      if (streamBuffer.includes(`<${SUMMARY_TAG}>`)) {
        let summaryContent = streamBuffer.replace(`<${SUMMARY_TAG}>`, '');
        if (summaryContent.includes(`</${SUMMARY_TAG}>`)) {
          summaryContent = summaryContent.split(`</${SUMMARY_TAG}>`)[0];
        }

        summaryContent = summaryContent.trim();
        if (summaryContent) {
          console.log(`[Auto Router] Extracted Summary: "${summaryContent.substring(0, 50)}..."`);
          try {
            await prisma.chatSummary.upsert({
              where: { sessionId: sessionId },
              update: { summary: summaryContent },
              create: { sessionId: sessionId, summary: summaryContent }
            });
            console.log("[Auto Router] Summary saved to DB.");
          } catch (dbErr) {
            console.error("[Auto Router] Failed to save summary:", dbErr);
          }
        }
      }
    }

    return {
      streamResult: combinedStream(),
      finalModelName: routerModelName
    };

  } catch (error) {
    console.error("[Auto Router] Router failed, falling back to Pro:", error);
    const proStreamResult = await ai.models.generateContentStream({
      model: proModelName,
      contents,
      config: {
        ...geminiConfig,
        systemInstruction,
        tools: adaptTools(tools)
      }
    });
    return { streamResult: proStreamResult, finalModelName: proModelName };
  }
}


export const getAvailableModels = async (req: Request, res: Response) => {
  try {
    // The node SDK doesn't expose listModels directly easily on the GoogleGenerativeAI class in older versions, 
    // but we can try to use the REST API or check if SDK supports it.
    // Recent SDKs might not have a direct listModels helper for API key auth easily accessible without headers hacking.
    // However, checking the user requirement: "fetch available models".
    // We can just hit the REST endpoint with the API Key.

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${gemini_api_key}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    const data = await response.json();

    // Filter or just return the list
    // data.models containing name (models/gemini-pro), displayName, etc.
    // We prefer just the simple names usually (gemini-pro) but the API returns "models/gemini-pro".
    // We should strip "models/" prefix for usage in getGenerativeModel usually, although SDK accepts both.
    // Let's normalize it.

    const models = (data.models || []).map((m: any) => ({
      name: m.name.replace('models/', ''),
      displayName: m.displayName,
      description: m.description,
      supportedGenerationMethods: m.supportedGenerationMethods
    }));

    res.json({
      message: "success",
      data: models
    });

  } catch (error) {
    console.error("Error listing models:", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message
    });
  }
}

const getProductContext = async (): Promise<string> => {
  const products = await prisma.product.findMany({
    include: {
      stockItems: {
        include: { reservations: true }
      },
      cookingInstructions: {
        select: { id: true, name: true, type: true }
      }
    }
  });

  const contextParts: string[] = ["Here is a list of ALL products available in the system, along with their current stock levels:"];
  for (const product of products) {
    const totalQuantity = product.stockItems.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate total reserved for the product (across all its stock items)
    const totalReserved = product.stockItems.reduce((sum, item) => {
      return sum + item.reservations.reduce((rSum, r) => rSum + r.amount, 0);
    }, 0);

    if (product.stockItems.length > 0) {
      const instructions = (product as any).cookingInstructions?.map((i: any) => i.name).join(', ');
      contextParts.push(`Product: ${product.title} (ID: ${product.id}) - Total Quantity: ${totalQuantity} (Reserved: ${totalReserved}) - Track By: ${product.trackCountBy}${instructions ? ` - Saved Instructions: ${instructions}` : ''}`);
      for (const stockItem of product.stockItems) {
        const itemReserved = stockItem.reservations.reduce((sum, r) => sum + r.amount, 0);
        contextParts.push(`  - Stock ID: ${stockItem.id}`);
        contextParts.push(`    Quantity: ${stockItem.quantity} ${stockItem.unit || ''} (Reserved: ${itemReserved})`);
        contextParts.push(`    Expiration Date: ${stockItem.expirationDate ? stockItem.expirationDate.toISOString().split('T')[0] : 'N/A'}`);
        contextParts.push(`    Status: ${stockItem.frozen ? 'Frozen' : 'Fresh'}, ${stockItem.opened ? 'Opened' : 'Unopened'}`);
      }
    } else {
      // List products with no stock so we can add to them
      const instructions = (product as any).cookingInstructions?.map((i: any) => i.name).join(', ');
      contextParts.push(`Product: ${product.title} (ID: ${product.id}) - Total Quantity: 0 - Track By: ${product.trackCountBy}${instructions ? ` - Saved Instructions: ${instructions}` : ''}`);
    }
  }
  return contextParts.join('\n');
};

const getFamilyContext = async (filterMemberIds?: number[]): Promise<string> => {
  let whereClause = {};
  if (filterMemberIds && filterMemberIds.length > 0) {
    whereClause = { id: { in: filterMemberIds } };
  }
  const members = await prisma.familyMember.findMany({ where: whereClause });
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'family_general_preferences' }
  });

  let context = "Family Information & Preferences:\n";
  if (setting?.value) {
    context += `\nGeneral Family Preferences (Apply to everyone unless specified): ${setting.value}\n`;
  }

  if (members.length > 0) {
    context += "\nIndividual Family Members:\n";
    for (const member of members) {
      context += `- Name: ${member.name}\n`;
      if (member.dateOfBirth) {
        context += `  Birthday: ${member.dateOfBirth.toISOString().split('T')[0]}\n`;
      }
      if (member.preferences) {
        context += `  Preferences/Dietary Restrictions: ${member.preferences}\n`;
      }
    }
  }
  return context;
};

const getEquipmentContext = async (): Promise<string> => {
  try {
    const equipment = await prisma.equipment.findMany();
    if (equipment.length === 0) return "No cooking equipment/appliances tracked.";

    let context = "Available Cooking Equipment & Appliances:\n";
    for (const item of equipment) {
      context += `- ${item.name}`;
      if (item.notes) context += ` (${item.notes})`;
      context += "\n";
    }
    return context;
  } catch (e) {
    console.error("Failed to fetch equipment for context", e);
    return "";
  }
};

const getWeatherContext = async (): Promise<string> => {
  try {
    const service = new WeatherService();
    // Get forecast for today and next 4 days
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 4);

    const forecasts = await service.getForecast(today, endDate);
    if (!forecasts || forecasts.length === 0) return "No weather forecast available.";

    let context = "Weather Forecast:\n";
    for (const f of forecasts) {
      context += `- ${f.date.toISOString().split('T')[0]}: ${f.condition}, High: ${f.highTemp}°F, Low: ${f.lowTemp}°F, Precip Chance: ${f.precipitationChance}%\n`;
    }
    return context;
  } catch (e) {
    console.error("Failed to fetch weather for context", e);
    return "";
  }
};


// ==============================
// CONTEXT CACHING HELPERS
// ==============================

/**
 * Generate a hash of the context content to detect changes
 */
function hashContext(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Build the system instruction with minimal context - tools will provide data on demand.
 */
async function buildSystemInstruction(additionalContext?: string): Promise<string> {
  return `
    You are a smart cooking assistant managing a pantry.
    Date: ${new Date().toLocaleDateString()}.
    
    **Core Rules:**
    1. **Response Format:** ALWAYS return a JSON object with a root 'items' array. Items can be type 'chat' (content string) or 'recipe' (structured object).
    2. **Printing:** To print a recipe, first call 'getRecipeDetails', then 'printReceipt' (max 1 call/turn). Confirm with "Sent [title] to printer."
    3. **Stock & Cooking Instructions:** Use provided tools. For package images, use 'createCookingInstruction' for each method (e.g., Microwave, Oven).
    4. **Quantities:** Respect 'trackCountBy' in inventory context. If 'weight', use weight; if 'quantity', use count.

    **CRITICAL - Use Tools for Context:**
    - You do NOT know what is in the inventory until you search. Always use 'searchInventory' or 'getAllProducts' to find products and stock levels.
    - Before recommending ANY recipe, you MUST check 'getFamilyPreferences' to ensure no allergies or dietary restrictions are violated.
    - Use 'getStockExpiringSoon' to find items that need to be used up.
    - Use 'getWeatherForecast' for weather-related meal suggestions.
    - Use 'getAvailableEquipment' to check what cooking appliances are available.
    - Use 'searchRecipes' and 'getRecipeDetails' to find and suggest saved recipes.

    **JSON Structure:**
    {
      "items": [
        { "type": "chat", "content": "Markdown text..." },
        { "type": "recipe", "recipe": { "title": "...", "ingredients": [{"name":"...", "amount":1, "productId":123}], "instructions": ["..."], "time": { "prep": "...", "cook": "..." } } }
      ]
    }

    ${additionalContext ? `**User View Context:** ${additionalContext}` : ''}
  `;
}

/**
 * Get or create a context cache for the chat model.
 * Returns the cache name if caching is supported and successful, otherwise null.
 */
async function getOrCreateContextCache(modelName: string, additionalContext?: string): Promise<{ name: string; isHit: boolean } | null> {
  // Check if the model supports caching
  const supportsCaching = CACHE_SUPPORTED_MODELS.some(m => modelName.includes(m) || m.includes(modelName));
  if (!supportsCaching) {
    console.log(`[Context Cache] Model ${modelName} does not support caching, skipping`);
    return null;
  }

  try {
    const ai = await getAI();

    // Build the full context
    const systemInstruction = await buildSystemInstruction(additionalContext);

    // Estimate token count (rough: ~4 chars per token for English)
    // Gemini requires minimum 1024 tokens for caching
    const estimatedTokens = Math.ceil(systemInstruction.length / 4);
    const MIN_CACHE_TOKENS = 1024;

    if (estimatedTokens < MIN_CACHE_TOKENS) {
      console.log(`[Context Cache] Context too small for caching (est. ${estimatedTokens} tokens, min ${MIN_CACHE_TOKENS}), skipping`);
      return null;
    }

    const contextHash = hashContext(systemInstruction);

    // Check if current cache is still valid
    const now = new Date();

    // Debug logging for cache hit/miss analysis
    if (currentCacheName) {
      console.log(`[Context Cache] Hash Check - Current: ${currentCacheHash}, New: ${contextHash}`);
      console.log(`[Context Cache] Expiration Check - Expires: ${cacheExpiresAt?.toISOString()}, Now: ${now.toISOString()}`);
      if (currentCacheHash === contextHash && cacheExpiresAt && cacheExpiresAt > now) {
        console.log(`[Context Cache] HIT - Using existing cache: ${currentCacheName}`);
        return { name: currentCacheName, isHit: true };
      } else {
        console.log(`[Context Cache] MISS - ${currentCacheHash !== contextHash ? 'Hash mismatch (content changed)' : 'Expired'}`);
        // If content changed, let's log what changed if we can (simplified: just length)
        if (currentCacheHash !== contextHash) {
          console.log(`[Context Cache] Content Length - Old (approx): "unknown", New: ${systemInstruction.length}`);
        }
      }
    } else {
      console.log(`[Context Cache] No active cache found. New Hash: ${contextHash}`);
    }

    // If we have an old cache with different content, try to delete it
    if (currentCacheName && currentCacheHash !== contextHash) {
      try {
        console.log(`[Context Cache] Context changed, deleting old cache: ${currentCacheName}`);
        await ai.caches.delete({ name: currentCacheName });
      } catch (e) {
        console.warn("[Context Cache] Failed to delete old cache:", e);
      }
    }

    // Create a new cache
    console.log(`[Context Cache] Creating new cache for model ${modelName}`);

    // The cache needs some initial content to cache along with system instruction
    // We'll cache the system instruction and a priming acknowledgment
    const cache = await ai.caches.create({
      model: modelName,
      config: {
        displayName: `pantry-chat-context-${Date.now()}`,
        systemInstruction: systemInstruction,
        contents: [
          {
            role: "user",
            parts: [{ text: "You are ready to assist with pantry management. Confirm you understand the rules." }]
          },
          {
            role: "model",
            parts: [{ text: "Understood. I will always return valid JSON with a root 'items' array containing objects with 'type': 'recipe' or 'type': 'chat'. I have access to your inventory, family preferences, equipment, and weather context." }]
          }
        ],
        ttl: "3600s" // 1 hour TTL
      }
    });

    currentCacheName = cache.name || null;
    currentCacheHash = contextHash;
    cacheExpiresAt = new Date(now.getTime() + 3600 * 1000); // 1 hour from now

    console.log(`[Context Cache] Cache created: ${cache.name}, expires: ${cacheExpiresAt.toISOString()}`);
    return { name: cache.name!, isHit: false };

  } catch (error) {
    console.error("[Context Cache] Failed to create cache:", error);
    return null;
  }
}

/**
 * Get a model instance that uses the cached content if available.
 * Falls back to regular model if caching fails or is not supported.
 */
async function getCachedModel(featureKey: string, additionalContext?: string): Promise<{
  model: any;
  modelName: string;
  usingCache: boolean;
  systemInstruction?: string;
  cacheName?: string;
}> {
  const ai = await getAI();
  const modelName = await getModelName(featureKey);

  try {
    const cacheResult = await getOrCreateContextCache(modelName, additionalContext);

    if (cacheResult) {
      const { name, isHit } = cacheResult;

      // Return a wrapper that uses the cached content
      // The new SDK uses the cache name in the generateContent call
      return {
        model: {
          // Wrapper that passes cache name to generateContent
          generateContentWithCache: async (request: any) => {
            return ai.models.generateContent({
              model: modelName,
              cachedContent: name,
              contents: request.contents || request,
              config: request.config
            });
          },
          generateContentStreamWithCache: async (request: any) => {
            return ai.models.generateContentStream({
              model: modelName,
              cachedContent: name,
              contents: request.contents || request,
              config: request.config
            });
          }
        },
        modelName,
        usingCache: isHit,
        cacheName: name
      };
    }
  } catch (error) {
    console.warn("[Context Cache] Failed to get cached model, falling back to regular model:", error);
  }

  // Build system instruction for non-cached fallback
  const systemInstruction = await buildSystemInstruction(additionalContext);
  const { model } = await getGeminiModel(featureKey);
  return { model, modelName, usingCache: false, systemInstruction };
}


export const extractRecipeQuickActions = async (req: Request, res: Response) => {
  try {
    const { recipeId, title, ingredients, steps } = req.body;
    // We expect either recipeId (to fetch) or title+ingredients+steps (if editing new/unsaved)

    let recipeTitle = title;
    let recipeIngredients = ingredients || [];
    let recipeSteps = steps || [];

    if (recipeId) {
      const recipe = await prisma.recipe.findUnique({
        where: { id: parseInt(recipeId) },
        include: { steps: { orderBy: { stepNumber: 'asc' } }, ingredients: true }
      });
      if (recipe) {
        recipeTitle = recipe.name;
        recipeIngredients = recipe.ingredients;
        recipeSteps = recipe.steps;
      }
    }

    const result = await determineQuickActions(recipeTitle, recipeIngredients, recipeSteps);

    res.json({
      message: "success",
      data: result
    });
  } catch (error) {
    console.error("Error extracting quick actions:", error);
    res.status(500).json({ error: "Failed to extract actions" });
  }
}

// ========================================
// SHARED CHAT HELPERS
// ========================================

function fileToGenerativePart(filePath: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

/**
 * Strip markdown code fences and extract valid JSON from model output.
 */
function cleanJson(text: string): string {
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const potentialJson = text.substring(jsonStart, jsonEnd + 1);
    try {
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) { /* fall through */ }
  }
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  return cleaned.trim();
}

/**
 * Normalize non-standard model responses into {items: [...]} format.
 * Gemini 3 models sometimes return {type: "message", message: "text"} or similar.
 * Must ALWAYS return an object with a valid items array.
 */
function normalizeResponse(data: any, label: string = 'Gemini'): any {
  // Already in the correct format
  if (data.items && Array.isArray(data.items) && data.items.length > 0) {
    return data;
  }

  // Try to extract text content from various field names the model might use
  const textFields = ['content', 'message', 'text', 'response'];
  for (const field of textFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const val = data[field];
      if (typeof val === 'string' && val.trim().length > 0) {
        console.log(`[${label}] Normalizing non-standard response: found '${field}' field (keys: ${Object.keys(data).join(', ')})`);
        return { items: [{ type: 'chat', content: val }] };
      } else if (typeof val === 'object') {
        // Model returned an object/array in a text field — stringify it
        console.log(`[${label}] Normalizing non-standard response: '${field}' is an object (keys: ${Object.keys(data).join(', ')})`);
        return { items: [{ type: 'chat', content: JSON.stringify(val, null, 2) }] };
      }
    }
  }

  // Check for recipe format
  if (data.recipe && typeof data.recipe === 'object') {
    console.log(`[${label}] Normalizing non-standard response: found recipe object`);
    return { items: [{ type: 'recipe', recipe: data.recipe }] };
  }

  // Final fallback: the model returned something we can't understand at all.
  // Rather than returning the raw object (which gets stringified as ugly JSON),
  // log it and return a user-friendly fallback.
  const keys = Object.keys(data);
  const hasOnlyEmptyValues = keys.every(k => {
    const v = data[k];
    return v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');
  });

  if (hasOnlyEmptyValues) {
    console.warn(`[${label}] Model returned empty/null-valued response (keys: ${keys.join(', ')}). Returning user-friendly fallback.`);
    return { items: [{ type: 'chat', content: "I wasn't able to generate a response for that. Could you try rephrasing your question?" }] };
  }

  // Non-empty but unrecognized structure — log the full payload for debugging
  console.warn(`[${label}] Model returned unrecognized response structure (keys: ${keys.join(', ')}). Data: ${JSON.stringify(data).substring(0, 500)}`);
  return { items: [{ type: 'chat', content: JSON.stringify(data, null, 2) }] };
}

/**
 * Read debug/logging settings from the database.
 */
async function getDebugSettings(): Promise<{ isGeminiDebug: boolean; isDbLogging: boolean }> {
  const [debugSetting, dbLogSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'gemini_debug' } }),
    prisma.systemSetting.findUnique({ where: { key: 'gemini_debug_logging' } })
  ]);
  return {
    isGeminiDebug: debugSetting?.value === 'true',
    isDbLogging: dbLogSetting?.value === 'true'
  };
}

/**
 * Write a debug log entry to the database (fire-and-forget).
 */
function writeDebugLog(
  sessionId: number,
  reqStart: number,
  reqEnd: number,
  requestContents: any,
  responseText: string,
  toolCalls?: any[]
): void {
  prisma.geminiDebugLog.create({
    data: {
      sessionId,
      requestTimestamp: new Date(reqStart),
      responseTimestamp: new Date(reqEnd),
      durationMs: reqEnd - reqStart,
      statusCode: 200,
      requestData: JSON.stringify(requestContents),
      responseData: responseText,
      toolCalls: JSON.stringify(toolCalls || [])
    }
  }).catch(err => console.error("Failed to write debug log:", err));
}

/**
 * Process local intents (e.g., adding to shopping list) before hitting the Gemini API.
 * Returns the intent result if handled, or null if no local intent matched.
 */
async function processLocalIntent(
  prompt: string,
  sessionId: number | undefined,
  entityType?: string,
  entityId?: number | string
): Promise<{ sessionId: number; responseText: string; responseData: any } | null> {
  try {
    const intentRes = await intentEngine.process(prompt);
    if (intentRes.intent !== 'shopping.add' || intentRes.score <= 0.8) return null;

    console.log(`[SmartChat] Detected local intent: ${intentRes.intent}`);

    let itemToAdd = null;
    const patterns = [
      /add (.*) to (?:the |my )?shopping list/i,
      /add (.*) to (?:the |my )?list/i,
      /put (.*) on (?:the |my )?shopping list/i,
      /put (.*) on (?:the |my )?list/i,
      /^buy (.*)$/i,
      /^need (.*)$/i,
      /remind me to buy (.*)/i
    ];

    for (const p of patterns) {
      const match = prompt.match(p);
      if (match && match[1]) {
        itemToAdd = match[1].trim().replace(/[.!?]$/, '');
        break;
      }
    }

    if (!itemToAdd) return null;

    // Ensure session exists
    if (!sessionId) {
      const session = await prisma.chatSession.create({
        data: {
          title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          entityType: entityType || null,
          entityId: entityId ? parseInt(entityId.toString(), 10) : null
        }
      });
      sessionId = session.id;
    } else {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() }
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { sessionId, sender: 'user', type: 'chat', content: prompt }
    });

    // Add to shopping list
    let shoppingList = await prisma.shoppingList.findFirst();
    if (!shoppingList) {
      shoppingList = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });
    }

    const existingItem = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: shoppingList.id, name: itemToAdd }
    });

    if (existingItem) {
      await prisma.shoppingListItem.update({
        where: { id: existingItem.id },
        data: { quantity: (existingItem.quantity || 1) + 1 }
      });
    } else {
      await prisma.shoppingListItem.create({
        data: { shoppingListId: shoppingList.id, name: itemToAdd, quantity: 1 }
      });
    }

    const botResponseText = `I've added **${itemToAdd}** to your shopping list.`;

    await prisma.chatMessage.create({
      data: { sessionId, sender: 'model', type: 'chat', content: botResponseText }
    });

    return {
      sessionId,
      responseText: botResponseText,
      responseData: { items: [{ type: 'chat', content: botResponseText }] }
    };
  } catch (err) {
    console.warn("Intent engine processing failed, falling back to Gemini", err);
    return null;
  }
}

/**
 * Create or load a chat session with full history reconstruction.
 * Handles chat summaries, tool call history, and image parts.
 */
async function prepareSession(
  sessionId: number | undefined,
  prompt: string,
  entityType?: string,
  entityId?: number | string,
  imageFilename?: string
): Promise<{ sessionId: number; history: Content[] }> {
  let history: Content[] = [];

  if (!sessionId) {
    const session = await prisma.chatSession.create({
      data: {
        title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        entityType: entityType || null,
        entityId: entityId ? parseInt(entityId.toString(), 10) : null
      }
    });
    sessionId = session.id;
  } else {
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    }) as any[];

    // Check for chat summary (used for long conversations)
    const chatSummary = await prisma.chatSummary.findUnique({
      where: { sessionId }
    });

    if (chatSummary && chatSummary.summary) {
      console.log(`[Session] Using Chat Summary for Session ${sessionId}`);
      history = [
        { role: "user", parts: [{ text: `[SYSTEM: CONVERSATION SUMMARY]\nThe following is a summary of the conversation history so far. Use this context to answer the latest user request.\n\n${chatSummary.summary}` }] },
        { role: "model", parts: [{ text: "Understood. I will use this summary as context." }] }
      ];
    } else {
      // Full history reconstruction including tool calls
      const historyItems: Content[] = [];

      for (const msg of messages) {
        if (msg.type === 'tool_call' && msg.toolCallData) {
          try {
            const toolData = JSON.parse(msg.toolCallData);
            if (toolData.name && toolData.args !== undefined && toolData.result !== undefined) {
              historyItems.push({
                role: 'model',
                parts: [{
                  functionCall: { name: toolData.name, args: toolData.args },
                  thoughtSignature: "skip_thought_signature_validator"
                } as any]
              });
              historyItems.push({
                role: 'user',
                parts: [{
                  functionResponse: { name: toolData.name, response: { result: toolData.result } }
                }]
              });
            }
          } catch (e) {
            console.warn("Failed to parse tool call data for history:", e);
          }
        } else {
          let text = msg.content || '';
          if (msg.type === 'recipe' && msg.recipeData) {
            text = JSON.stringify({ items: [{ type: 'recipe', recipe: JSON.parse(msg.recipeData) }] });
          }

          const parts: any[] = [];
          if (text) parts.push({ text });

          if (msg.imageUrl) {
            const ext = path.extname(msg.imageUrl).toLowerCase();
            let mime = 'image/jpeg';
            if (ext === '.png') mime = 'image/png';
            if (ext === '.webp') mime = 'image/webp';
            if (ext === '.heic') mime = 'image/heic';
            if (ext === '.heif') mime = 'image/heif';

            try {
              const fullPath = path.join(UPLOAD_DIR, msg.imageUrl);
              if (fs.existsSync(fullPath)) {
                parts.push(fileToGenerativePart(fullPath, mime));
              }
            } catch (e) {
              console.error("Failed to load image for history", e);
            }
          }

          if (parts.length > 0) {
            historyItems.push({ role: msg.sender, parts } as Content);
          }
        }
      }
      history = historyItems;
    }
  }

  // Save user message to DB
  await prisma.chatMessage.create({
    data: { sessionId, sender: 'user', type: 'chat', content: prompt, imageUrl: imageFilename }
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() }
  });

  return { sessionId, history };
}

/**
 * Save parsed Gemini response items to the database.
 */
async function saveResponseToDb(sessionId: number, data: any, modelUsed?: string): Promise<void> {
  try {
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.type === 'recipe' && item.recipe) {
          await prisma.chatMessage.create({
            data: { sessionId, sender: 'model', type: 'recipe', recipeData: JSON.stringify(item.recipe), modelUsed }
          });
        } else {
          await prisma.chatMessage.create({
            data: { sessionId, sender: 'model', type: 'chat', content: item.content || JSON.stringify(item), modelUsed }
          });
        }
      }
    } else {
      const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');
      if (isRecipe && data.recipe) {
        await prisma.chatMessage.create({
          data: { sessionId, sender: 'model', type: 'recipe', recipeData: JSON.stringify(data.recipe), modelUsed }
        });
      } else {
        let content = data.content;
        if (typeof content === 'object') content = JSON.stringify(content, null, 2);
        else if (!content) content = JSON.stringify(data, null, 2);
        await prisma.chatMessage.create({
          data: { sessionId, sender: 'model', type: 'chat', content, modelUsed }
        });
      }
    }
  } catch (dbError) {
    console.error("Failed to save model response to DB:", dbError);
  }
}

/**
 * Generate or update the chat session title based on the first exchange.
 */
async function generateSessionTitle(sessionId: number, prompt: string, data: any, io?: any): Promise<void> {
  try {
    const currentSession = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!currentSession) return;

    const messageCount = await prisma.chatMessage.count({ where: { sessionId } });
    if (messageCount > 2 && currentSession.title !== 'New Chat') return;

    const titlePrompt = `Based on the following conversation, generate a short, concise, and descriptive title (max 6 words). Return ONLY the title text, no quotes or "Title:".\n\nUser: ${prompt}\nInternal Model Response: ${JSON.stringify(data).substring(0, 500)}...`;

    const ai = await getAI();
    const modelName = await getModelName("gemini_chat_model");
    const titleResponse = await ai.models.generateContent({
      model: modelName,
      contents: titlePrompt
    });

    let newTitle = (titleResponse.text || '').trim().replace(/^"|"$/g, '').trim();
    if (newTitle) {
      await prisma.chatSession.update({ where: { id: sessionId }, data: { title: newTitle } });
      if (io) {
        io.emit('chat_session_updated', { sessionId, title: newTitle });
      }
    }
  } catch (titleError) {
    console.warn("Failed to generate chat title:", titleError);
  }
}

/**
 * Copy response parts and inject thoughtSignature for Gemini 3 tool calling.
 * The SDK v0.24.1 strips thoughtSignature, but Gemini 3 models require it.
 * Uses "skip_thought_signature_validator" per Google's documentation.
 */
function injectThoughtSignatures(rawParts: any[]): any[] {
  let hasFunctionCallNeedingSignature = false;
  return rawParts.map((part: any) => {
    const copiedPart: any = {};
    if (part.text !== undefined) copiedPart.text = part.text;
    if (part.inlineData) copiedPart.inlineData = part.inlineData;
    if (part.functionCall) {
      copiedPart.functionCall = {
        name: part.functionCall.name,
        args: part.functionCall.args
      };
      if (!hasFunctionCallNeedingSignature) {
        hasFunctionCallNeedingSignature = true;
        copiedPart.thoughtSignature = part.thoughtSignature || "skip_thought_signature_validator";
      }
    }
    if (part.functionResponse) copiedPart.functionResponse = part.functionResponse;
    return copiedPart;
  });
}

// ========================================
// CHAT ENDPOINTS
// ========================================

export const post = async (req: Request, res: Response) => {
  try {
    let { prompt, sessionId, additionalContext, entityType, entityId } = req.body as {
      prompt: string;
      sessionId?: number | string;
      additionalContext?: string;
      entityType?: string;
      entityId?: number | string;
    };

    if (sessionId) sessionId = parseInt(sessionId as string, 10);

    // --- LOCAL INTENT PROCESSING ---
    const intentResult = await processLocalIntent(prompt, sessionId as number | undefined, entityType, entityId);
    if (intentResult) {
      return res.json({
        message: "success",
        sessionId: intentResult.sessionId,
        result: intentResult.responseData
      });
    }

    // --- IMAGE UPLOAD ---
    let imageFilename: string | null = null;
    let imagePart: any = null;

    if (req.files && req.files.image) {
      const image = req.files.image as UploadedFile;
      const ext = path.extname(image.name);
      imageFilename = `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
      storeFile(image.tempFilePath, imageFilename);
      imagePart = fileToGenerativePart(path.join(UPLOAD_DIR, imageFilename), image.mimetype);
    }

    // --- SESSION + HISTORY ---
    const session = await prepareSession(
      sessionId as number | undefined, prompt, entityType, entityId, imageFilename || undefined
    );
    sessionId = session.sessionId;
    const history = session.history;

    // --- MODEL + CACHING ---
    const { modelName, usingCache, systemInstruction, cacheName } = await getCachedModel("gemini_chat_model", additionalContext);
    const ai = await getAI();

    // --- BUILD CONTENTS ---
    const userParts: any[] = [{ text: prompt }];
    if (imagePart) userParts.push(imagePart);

    const contents: Content[] = [
      ...history,
      { role: "user", parts: userParts },
    ];

    // --- DEBUG + TOOLS ---
    const { isGeminiDebug, isDbLogging } = await getDebugSettings();
    const tools = getAllToolDefinitions();
    const toolDisplayNames = sharedToolDisplayNames;
    const toolContext: ToolContext = {
      userId: (req as any).userId || (req.user as any)?.id,
      io: req.app.get("io")
    };

    // --- GENERATE + TOOL LOOP ---
    let currentContents = [...contents];
    let loopCount = 0;
    const maxLoops = 5;
    let printedInThisTurn = false;
    let printedOnce = false;
    let responseResult: any;

    while (loopCount <= maxLoops) {
      if (isGeminiDebug) {
        console.log(`--- GEMINI DEBUG CONTEXT (Loop ${loopCount}) ---`);
        const contentSummary = currentContents.map((c: any) =>
          `${c.role}(${c.parts.length} parts)`
        ).join(', ');
        console.log(`[Post Loop ${loopCount}] Contents: [${contentSummary}]`);
        console.log("--------------------------------------");
      }

      const reqStart = Date.now();
      const effectiveSystemInstruction = !usingCache && systemInstruction
        ? systemInstruction
        : undefined;

      responseResult = await ai.models.generateContent({
        model: modelName,
        contents: currentContents,
        ...(cacheName ? { cachedContent: cacheName } : {}),
        config: {
          ...geminiConfig,
          systemInstruction: effectiveSystemInstruction,
          tools: adaptTools(tools)
        }
      });
      const reqEnd = Date.now();

      if (isDbLogging) {
        let serializedResponse = '';
        try { serializedResponse = JSON.stringify(responseResult); }
        catch (e) { serializedResponse = "Could not serialize response: " + (e as Error).message; }

        const fcParts = (responseResult.candidates?.[0]?.content?.parts || [])
          .filter((p: any) => p.functionCall);
        writeDebugLog(sessionId as number, reqStart, reqEnd, currentContents, serializedResponse,
          fcParts.map((p: any) => p.functionCall));
      }

      // Extract function calls from response
      const responseParts = responseResult.candidates?.[0]?.content?.parts || [];
      const functionCalls = responseParts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (functionCalls.length === 0) break; // No tool calls, done

      // Add model's response with thought signatures
      currentContents.push({
        role: "model",
        parts: injectThoughtSignatures(responseParts)
      });

      // Execute tools
      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
        // Print loop protection
        if (call.name === 'printReceipt') {
          if (printedOnce) {
            toolResponseParts.push({
              functionResponse: { name: call.name, response: { result: { error: "You have already printed in this turn. Do not loop." } } }
            });
            continue;
          }
          printedOnce = true;
          printedInThisTurn = true;
        }

        const toolResult = await executeToolHandler(call.name, call.args, toolContext);
        toolResponseParts.push({
          functionResponse: { name: call.name, response: { result: toolResult } }
        });
      }

      currentContents.push({ role: "user", parts: toolResponseParts });
      loopCount++;
    }

    // --- PARSE RESPONSE ---
    const responseText = responseResult.text || '';
    let data;
    if (!responseText || responseText.trim().length === 0) {
      console.warn(`[Post] Empty responseText after generation. Tool loops: ${loopCount}. This likely means the model returned only tool calls or an empty response.`);
      data = { items: [{ type: 'chat', content: "I processed your request but wasn't able to generate a text response. Please try again or rephrase your question." }] };
    } else {
      console.log(`[Post] Parsing responseText (${responseText.length} chars, first 200): ${responseText.substring(0, 200)}`);
      try {
        data = JSON.parse(cleanJson(responseText));
      } catch (e) {
        console.warn("Failed to parse JSON response, using raw text", e);
        data = { items: [{ type: 'chat', content: responseText }] };
      }
    }
    data = normalizeResponse(data, 'Post');


    // Print safety net
    if (printedInThisTurn) {
      if (!data.items) data.items = [];
      if (Array.isArray(data.items) && data.items.length === 0) {
        data.items.push({ type: 'chat', content: "I've sent that to the printer." });
      }
    }

    // --- SAVE + TITLE ---
    await saveResponseToDb(sessionId as number, data, modelName);
    generateSessionTitle(sessionId as number, prompt, data).catch(() => { });

    const usageMetadata = responseResult.usageMetadata;

    res.json({
      message: "success",
      data,
      sessionId,
      meta: { usingCache, modelName, usageMetadata }
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({ message: "error", data: (error as Error).message });
  }
};

// ==============================
// STREAMING CHAT ENDPOINT (SSE)
// ==============================

export const postStream = async (req: Request, res: Response) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let { prompt, sessionId, additionalContext, entityType, entityId } = req.body as {
      prompt: string;
      sessionId?: number | string;
      additionalContext?: string;
      entityType?: string;
      entityId?: number | string;
    };

    if (sessionId) sessionId = parseInt(sessionId as string, 10);

    // --- LOCAL INTENT PROCESSING ---
    const intentResult = await processLocalIntent(prompt, sessionId as number | undefined, entityType, entityId);
    if (intentResult) {
      sendEvent('session', { sessionId: intentResult.sessionId });
      sendEvent('chunk', { text: intentResult.responseText });
      sendEvent('done', { data: intentResult.responseData });
      res.end();
      return;
    }

    // --- SESSION + HISTORY ---
    const session = await prepareSession(sessionId as number | undefined, prompt, entityType, entityId);
    sessionId = session.sessionId;
    const history = session.history;

    sendEvent('session', { sessionId });

    // --- MODEL + ROUTING ---
    const systemInstruction = await buildSystemInstruction(additionalContext);
    const streamTools = getAllToolDefinitions();
    const toolDisplayNames = sharedToolDisplayNames;
    const { isGeminiDebug, isDbLogging } = await getDebugSettings();

    let modelSetting = "gemini-flash-latest";
    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "gemini_chat_model" } });
      if (setting?.value) modelSetting = setting.value;
    } catch (err) { console.warn("Failed to get chat model setting"); }

    let finalModelName: string;
    let usingCache = false;
    let preGeneratedStreamResult: any = null;
    let cacheName: string | undefined;

    if (modelSetting === AUTO_MODEL) {
      const preliminaryContents: Content[] = [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
      ];

      const { streamResult, finalModelName: routedModelName } = await routeAndExecute(
        sessionId as number, systemInstruction, preliminaryContents,
        streamTools, geminiConfig, additionalContext
      );

      preGeneratedStreamResult = streamResult;
      finalModelName = routedModelName;
      console.log(`[Stream] Auto-routed to: ${finalModelName}`);
    } else {
      const cached = await getCachedModel("gemini_chat_model", additionalContext);
      finalModelName = cached.modelName;
      usingCache = cached.usingCache;
      cacheName = cached.cacheName;
      console.log(`[Stream] Using ${usingCache ? 'cached' : 'non-cached'} model: ${finalModelName}`);
    }

    sendEvent('meta', { modelName: finalModelName, usingCache });

    // --- BUILD CONTENTS ---
    const effectiveSystemInstruction = systemInstruction && systemInstruction.trim().length > 0
      ? systemInstruction : "You are a helpful assistant.";
    const contents: Content[] = [
      ...history,
      { role: "user", parts: [{ text: prompt }] },
    ];

    // --- TOOL CONTEXT ---
    const streamToolContext: ToolContext = {
      userId: (req as any).userId || (req.user as any)?.id,
      io: req.app.get("io")
    };

    // --- STREAMING GENERATION + TOOL LOOP ---
    let fullText = '';
    let currentContents = [...contents];
    let loopCount = 0;
    const maxLoops = 5;

    try {
      while (loopCount < maxLoops) {
        loopCount++;
        let streamResult: any;
        let collectedChunks: any[] = [];

        const reqStart = Date.now();

        if (loopCount === 1 && preGeneratedStreamResult) {
          streamResult = preGeneratedStreamResult;
          preGeneratedStreamResult = null;
        } else {
          if (isGeminiDebug) {
            const contentSummary = currentContents.map((c: any) =>
              `${c.role}(${c.parts.length} parts${c.parts.some((p: any) => p.thoughtSignature) ? '+sig' : ''})`
            ).join(', ');
            console.log(`[Stream Loop ${loopCount}] Calling generateContentStream: [${contentSummary}]`);
          }

          const ai = await getAI();
          streamResult = await ai.models.generateContentStream({
            model: finalModelName,
            contents: currentContents,
            ...(cacheName ? { cachedContent: cacheName } : {}),
            config: {
              ...geminiConfig,
              systemInstruction: usingCache ? undefined : effectiveSystemInstruction,
              tools: adaptTools(streamTools)
            }
          });
        }

        let hasToolCall = false;
        let toolCalls: any[] = [];

        // Stream text chunks to UI
        const streamIterable = streamResult.stream ? streamResult.stream : streamResult;
        for await (const chunk of streamIterable) {
          collectedChunks.push(chunk);

          // Extract text from candidates' parts (safe) or from reconstituted stream's text property
          let chunkText = '';
          const candidate = chunk.candidates?.[0];
          if (candidate?.content?.parts) {
            // Extract text only from text parts, skip function call parts
            for (const part of candidate.content.parts) {
              if (part.text) {
                chunkText += part.text;
              }
              if (part.functionCall) {
                const displayName = toolDisplayNames[part.functionCall.name] || `Using ${part.functionCall.name}...`;
                sendEvent('tool_call', { toolCall: { name: part.functionCall.name, args: part.functionCall.args }, displayName });
              }
            }
          } else if (typeof chunk.text === 'string' && chunk.text) {
            // Reconstituted stream from routeAndExecute — text is a plain property
            chunkText = chunk.text;
          }

          if (chunkText) {
            fullText += chunkText;
            sendEvent('chunk', { text: chunkText });
          }
        }

        const reqEnd = Date.now();

        // Get response parts from chunks - ALWAYS aggregate from all chunks
        // The last chunk may only have the final text/FC, not all of them
        let rawResponseParts: any[] = [];
        const seenFunctionNames = new Set<string>();

        for (const chunk of collectedChunks) {
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.functionCall) {
              // Deduplicate function calls (streaming may repeat across chunks)
              const key = `${part.functionCall.name}:${JSON.stringify(part.functionCall.args)}`;
              if (!seenFunctionNames.has(key)) {
                seenFunctionNames.add(key);
                rawResponseParts.push(part);
              }
            } else if (part.text || part.thoughtSignature) {
              rawResponseParts.push(part);
            }
          }
          // Also check reconstituted stream's functionCalls property
          if (chunk.functionCalls) {
            for (const fc of chunk.functionCalls) {
              const key = `${fc.name}:${JSON.stringify(fc.args)}`;
              if (!seenFunctionNames.has(key)) {
                seenFunctionNames.add(key);
                rawResponseParts.push({ functionCall: fc });
              }
            }
          }
        }

        // Always log tool loop info for debugging
        const fcParts = rawResponseParts.filter((p: any) => p.functionCall);
        const textParts = rawResponseParts.filter((p: any) => p.text);
        console.log(`[Stream Loop ${loopCount}] ${collectedChunks.length} chunks, ${rawResponseParts.length} parts (${fcParts.length} FCs, ${textParts.length} text), fullText length: ${fullText.length}`);
        if (fcParts.length > 0) {
          console.log(`[Stream Loop ${loopCount}] Function calls: ${fcParts.map((p: any) => p.functionCall.name).join(', ')}`);
        }
        if (fullText.length > 0 && fullText.length < 200) {
          console.log(`[Stream Loop ${loopCount}] fullText: "${fullText}"`);
        }

        // DB debug logging
        if (isDbLogging) {
          writeDebugLog(sessionId as number, reqStart, reqEnd, currentContents, fullText,
            fcParts.map((p: any) => p.functionCall));
        }

        // Inject thought signatures
        const responseParts = injectThoughtSignatures(rawResponseParts);

        // Check for function calls
        for (const part of responseParts) {
          if (part.functionCall) {
            hasToolCall = true;
            toolCalls.push(part.functionCall);
          }
        }

        if (hasToolCall && toolCalls.length > 0) {
          console.log(`[Stream Loop ${loopCount}] Executing ${toolCalls.length} tool(s): ${toolCalls.map(tc => tc.name).join(', ')}`);
          currentContents.push({ role: "model", parts: responseParts });

          const toolResponses: any[] = [];
          for (const call of toolCalls) {
            const toolStartTime = Date.now();
            const result = await executeToolHandler(call.name, call.args, streamToolContext);
            const toolDurationMs = Date.now() - toolStartTime;

            const displayName = toolDisplayNames[call.name] || `Using ${call.name}...`;
            console.log(`[Stream Loop ${loopCount}] Tool ${call.name} completed in ${toolDurationMs}ms`);

            // Save tool call to DB (fire-and-forget)
            prisma.chatMessage.create({
              data: {
                sessionId: sessionId as number,
                sender: 'model',
                type: 'tool_call',
                content: displayName,
                toolCallData: JSON.stringify({ name: call.name, displayName, args: call.args, result }),
                toolCallDurationMs: toolDurationMs
              }
            }).catch(err => console.error("Failed to save tool call:", err));

            toolResponses.push({
              functionResponse: { name: call.name, response: { result } }
            });
          }

          currentContents.push({ role: "user", parts: toolResponses });
          fullText = ''; // Reset for next iteration
        } else {
          console.log(`[Stream Loop ${loopCount}] No tool calls, breaking. fullText length: ${fullText.length}`);
          break; // No more tool calls
        }
      }
    } catch (streamError: any) {
      console.error("Streaming error:", streamError);
      sendEvent('error', { message: streamError.message || 'Streaming failed' });
      res.end();
      return;
    }

    // --- PARSE RESPONSE ---
    let data;
    if (!fullText || fullText.trim().length === 0) {
      console.warn(`[Stream] Empty fullText after streaming. Tool loops: ${loopCount}. This likely means the model returned only tool calls or an empty response.`);
      data = { items: [{ type: 'chat', content: "I processed your request but wasn't able to generate a text response. Please try again or rephrase your question." }] };
    } else {
      console.log(`[Stream] Parsing fullText (${fullText.length} chars, first 200): ${fullText.substring(0, 200)}`);
      try {
        data = JSON.parse(cleanJson(fullText));
      } catch (e) {
        console.warn("Failed to parse JSON response (stream), using raw text", e);
        data = { items: [{ type: 'chat', content: fullText }] };
      }
    }

    data = normalizeResponse(data, 'Stream');

    // Send final event immediately
    sendEvent('done', {
      data,
      meta: { usingCache, modelName: finalModelName, usageMetadata: undefined }
    });
    res.end();

    // --- ASYNC POST-PROCESSING ---
    const io = req.app.get("io");
    saveResponseToDb(sessionId as number, data, finalModelName)
      .then(() => generateSessionTitle(sessionId as number, prompt, data, io))
      .catch(err => console.error("Post-processing error:", err));

  } catch (error) {
    console.error("Stream error:", error);
    sendEvent('error', { message: (error as Error).message });
    res.end();
  }
};

export const postImage = async (req: Request, res: Response) => {
  // Legacy endpoint — kept for backwards compatibility but redirects to analyzeProductImage
  return analyzeProductImage(req, res);
}

/**
 * Analyzes a product image using Gemini Vision and returns structured product details.
 * Does NOT create a product — just returns data for the frontend to populate a form.
 */
export const analyzeProductImage = async (req: Request, res: Response) => {
  try {
    const image: UploadedFile = <any>(req.files?.file || req.files?.image);

    if (!image) {
      res.status(400).json({ message: "No image file provided" });
      return;
    }

    const prompt = `Analyze this product image and extract as much detail as possible.
    
    Return a JSON object with:
    - title: The product name (clean, no brand unless it IS the product name like "Nutella"). Example: "Frosted Flakes" not "Kellogg's Frosted Flakes 15oz"
    - brand: The brand name if visible
    - trackCountBy: "quantity" or "weight" — how best to track remaining amount
    - freezerLifespanDays: estimated days good in freezer (integer or null)
    - refrigeratorLifespanDays: estimated days good in fridge (integer or null)
    - openedLifespanDays: estimated days good after opening (integer or null)
    - pantryLifespanDays: estimated days good on shelf unopened (integer or null)
    - tags: array of category tags (e.g. "Dairy", "Snack", "Breakfast")
    - description: a brief description of the specific variant/size if identifiable
    
    If you cannot identify the product, set title to "Unknown" and leave other fields null.`;

    const ai = await getAI();
    const modelName = await getModelName("gemini_vision_model", DEFAULT_FALLBACK_MODEL);

    const imagePart = fileToGenerativePart(image.tempFilePath, image.mimetype);

    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
      config: {
        ...geminiConfig,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            brand: { type: "STRING", nullable: true },
            trackCountBy: { type: "STRING", enum: ["quantity", "weight"] },
            freezerLifespanDays: { type: "INTEGER", nullable: true },
            refrigeratorLifespanDays: { type: "INTEGER", nullable: true },
            openedLifespanDays: { type: "INTEGER", nullable: true },
            pantryLifespanDays: { type: "INTEGER", nullable: true },
            tags: { type: "ARRAY", items: { type: "STRING" } },
            description: { type: "STRING", nullable: true }
          },
          required: ["title"]
        }
      }
    });

    const jsonString = result.text;
    const data = JSON.parse(jsonString);

    // Also upload the image as a File record so the frontend can attach it to the product
    const file = await prisma.file.create({
      data: {
        path: image.name,
        mimeType: image.mimetype
      }
    });
    storeFile(image.tempFilePath, file.id.toString());

    res.json({
      message: "success",
      data,
      file
    });

  } catch (error) {
    console.error("analyzeProductImage error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
}

export const postProductDetails = async (req: Request, res: Response) => {
  try {
    const { productTitle, productId } = req.body as { productTitle: string, productId?: number };

    if (!productTitle) {
      res.status(400).json({ message: "Product title is required" });
      return;
    }

    const prompt = `For the product '${productTitle}', estimate the recommended lifespan in days for the following conditions:
      1. Freezer lifespan: How many days it is good in the freezer.
      2. Refrigerator lifespan: How many days it is good in the refrigerator (after thawing if frozen).
      3. Opened lifespan: How many days it is good after being opened.
      4. Pantry/Shelf lifespan: How many days it is good on the shelf (unopened).
      
      Also, recommend the best way to track the remaining amount of this product: 'quantity' (e.g., cans, boxes) or 'weight' (e.g., flour, sugar, pasta).

      Return the result as a JSON object with keys: 
      - freezerLifespanDays
      - refrigeratorLifespanDays
      - openedLifespanDays
      - pantryLifespanDays
      - trackCountBy ('quantity' or 'weight')
      
      Use integer values for days. If unknown or if you are not sure for days, return null for that field. default trackCountBy to 'quantity' if unsure.`;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        freezerLifespanDays: { type: SchemaType.INTEGER, nullable: true },
        refrigeratorLifespanDays: { type: SchemaType.INTEGER, nullable: true },
        openedLifespanDays: { type: SchemaType.INTEGER, nullable: true },
        pantryLifespanDays: { type: SchemaType.INTEGER, nullable: true },
        trackCountBy: { type: SchemaType.STRING, enum: ["quantity", "weight"] }
      },
      required: [
        "freezerLifespanDays",
        "refrigeratorLifespanDays",
        "openedLifespanDays",
        "trackCountBy"
      ],
    } as any;

    const { result, warning } = await executeWithFallback(
      "gemini_expiration_model",
      async (model) => await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      })
    );

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    // Update product if ID provided
    if (productId) {
      try {
        await prisma.product.update({
          where: { id: productId },
          data: {
            freezerLifespanDays: data.freezerLifespanDays,
            refrigeratorLifespanDays: data.refrigeratorLifespanDays,
            openedLifespanDays: data.openedLifespanDays,
            pantryLifespanDays: data.pantryLifespanDays,
            // Only update trackCountBy if it's currently default 'quantity' or null? 
            // Or just trust Gemini? User might have set it manually. 
            // Let's only update if the current product trackBy is default or we want to overwrite.
            // For now, let's update it. If user changed it, they can change it back or we can check.
            trackCountBy: data.trackCountBy
          }
        });
      } catch (e) {
        console.error("Failed to update product details with AI data", e);
      }
    }

    res.json({
      message: "success",
      data: data,
      warning
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
};

export const postQuickSuggest = async (req: Request, res: Response) => {
  try {
    const { tags, selectedMemberIds } = req.body as { tags: string[], selectedMemberIds?: number[] };

    if (!tags || !Array.isArray(tags)) {
      res.status(400).json({ message: "Tags are required and must be an array" });
      return;
    }

    const productContext = await getProductContext();
    const familyContext = await getFamilyContext(selectedMemberIds);

    const prompt = `You are a kitchen assistant. Suggest 3 distinct snacks based on these tags: ${tags.join(', ')}. 
    Only suggest items that require ingredients currently in the user's inventory.
    
    Here is the inventory:
    ${productContext}

    Here are the family preferences. Please ensure suggestions align with these preferences for the selected family members:
    ${familyContext}

    Return a JSON object with a key 'suggestions' which is an array of objects. Each object should have:
    - name: string
    - prepTime: string (e.g. "5 mins")
    - description: string
    - ingredients: string[] (list of ingredients used)
    `;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        suggestions: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              prepTime: { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              ingredients: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            },
            required: ["name", "prepTime", "description", "ingredients"]
          }
        }
      },
      required: ["suggestions"]
    } as any;

    const { result, warning } = await executeWithFallback(
      "gemini_quick_snack_model",
      async (model) => await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      })
    );

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    res.json({
      message: "success",
      data: data.suggestions,
      warning
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
};

export const postThawAdvice = async (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: string[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "Items list is required and must be a non-empty array" });
      return;
    }

    const uniqueItems = Array.from(new Set(items));

    const prompt = `You are a kitchen assistant. Provide thawing advice for the following frozen items: ${uniqueItems.join(', ')}.
    
    For each item, estimate the time required to thaw it in the refrigerator (assuming standard refrigerator temperature).
    
    Return a JSON object with a key 'items' which is an array of objects. Each object should have:
    - name: string (the exact name of the item from the input list or closest match)
    - hoursToThaw: number (estimated hours required to thaw in the fridge)
    - advice: string (brief advice on how to thaw, e.g. "move to fridge 24h before")
    
    If an item does not typically need specific thawing (like small frozen veggies), you can set hoursToThaw to 0.
    `;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              hoursToThaw: { type: SchemaType.NUMBER },
              advice: { type: SchemaType.STRING }
            },
            required: ["name", "hoursToThaw", "advice"]
          }
        }
      },
      required: ["items"]
    } as any;

    const { result, warning } = await executeWithFallback(
      "gemini_thaw_model",
      async (model) => await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      })
    );

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    res.json({
      message: "success",
      data: data.items,
      warning
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
};

export const postProductMatch = async (req: Request, res: Response) => {
  try {
    const { productName, brand } = req.body;

    if (!productName) {
      res.status(400).json({ message: "Product name is required" });
      return;
    }

    const allProducts = await prisma.product.findMany({
      select: {
        id: true,
        title: true
      }
    });

    const prompt = `I have a scanned product with Name: "${productName}"${brand ? ` and Brand: "${brand}"` : ''}.
    Here is a list of existing products in my database:
    ${JSON.stringify(allProducts)}
    
    Is the scanned product a variation of any of the existing products? (e.g. Scanned "Target Pumpkin" vs Existing "Libby's Pumpkin").
    If it is a match or a close variation, return the ID of the existing product.
    If it is a completely new unique product, return null.
    
    Return the result as a JSON object with keys:
    - matchId (integer or null)
    `;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        matchId: { type: SchemaType.INTEGER, nullable: true }
      },
      required: ["matchId"]
    } as any;

    const { result, warning } = await executeWithFallback(
      "gemini_product_match",
      async (model) => await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      })
    );

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    if (data.matchId) {
      const match = allProducts.find(p => p.id === data.matchId);
      res.json({ matchId: data.matchId, matchTitle: match?.title, warning });
    } else {
      res.json({ matchId: null, warning });
    }

  } catch (error) {
    console.log("postProductMatch error", error);
    res.status(500).json({ message: "error", data: (error as Error).message });
  }
};

export const postBarcodeDetails = async (req: Request, res: Response) => {
  try {
    const { productName, brand, existingProductTitle } = req.body;

    const prompt = `I am adding a barcode for "${productName}"${brand ? ` (${brand})` : ''} to the pantry.
        
        TASKS:
        1. Suggest a **Clean Product Title**. 
           - Remove brand names (unless it's the product name like "Nutella"), sizes, packaging codes, and noise like "IMP", "Pack", "oz". 
           - Example: Input "Kellogg's Frosted Flakes 15oz IMP" -> Title "Frosted Flakes".
           - Example: Input "Gerber Grads Puffs Banana" -> Title "Banana Puffs".
        2. Extract/Validate the **Brand**.
        3. Create a **Short Description** for this specific barcode variant (e.g. "15oz Can", "Family Size", "Spicy variety").
        4. Suggest **Tags** (e.g. "Breakfast", "Snack").
        6. Suggest **Tracking Method** ('quantity' or 'weight').
        7. Suggest **Auto Print Label** (boolean).
           - True for items that need individual dates/tracking on the package (e.g. Meat, Leftovers, Frozen items repackaged, Items kept in freezer).
           - False for shelf-stable items, widely recognized packaging, or items with own dates (Cans, Boxes, Bottles).
        
        Return JSON keys:
        - title (string)
        - brand (string)
        - description (string)
        - tags (array of strings)
        - pantryLifespanDays (number or null)
        - refrigeratorLifespanDays (number or null)
        - freezerLifespanDays (number or null)
        - openedLifespanDays (number or null)
        - trackCountBy (string: "quantity" or "weight")
        - autoPrintLabel (boolean)
        `;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        brand: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
        tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        pantryLifespanDays: { type: SchemaType.NUMBER, nullable: true },
        refrigeratorLifespanDays: { type: SchemaType.NUMBER, nullable: true },
        freezerLifespanDays: { type: SchemaType.NUMBER, nullable: true },
        openedLifespanDays: { type: SchemaType.NUMBER, nullable: true },
        trackCountBy: { type: SchemaType.STRING, enum: ["quantity", "weight"] },
        autoPrintLabel: { type: SchemaType.BOOLEAN }
      },
      required: ["title", "brand", "description", "tags"]
    } as any;

    const { result, warning } = await executeWithFallback(
      "gemini_barcode_details",
      async (model) => await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      })
    );

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    res.json({ data, warning });

  } catch (error) {
    console.log("postBarcodeDetails error", error);
    res.status(500).json({ message: "error", data: (error as Error).message });
  }
};




export const postShoppingListSort = async (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: string[] };
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "No items provided" });
      return;
    }

    const { result } = await executeWithFallback(
      "gemini_sort_model",
      async (model) => {
        const prompt = `
          You are a helpful shopping assistant.
          Sort the following shopping list items in the order they would typically be found in a grocery store traversal (e.g., Produce -> Bakery -> Deli -> Meat -> Dairy -> Aisle items -> Frozen).
          Return ONLY a valid JSON object with a single key "sortedItems" containing the list of strings.
          Do not include any other text or markdown formatting.
          
          Items:
          ${JSON.stringify(items)}
        `;

        const result = await model.generateContent(prompt);
        return result.response;
      }
    );

    const text = result.text();
    const cleaned = cleanJson(text);
    const data = JSON.parse(cleaned);


    res.json(data);

  } catch (e: any) {
    console.error("Sort error", e);
    res.status(500).json({ error: e.message });
  }
}

export const generateProductImage = async (req: Request, res: Response) => {
  try {
    const { productTitle } = req.body;
    if (!productTitle) {
      res.status(400).json({ message: "Product title is required" });
      return;
    }

    // 1. Generate Prompt using Text Model
    const promptPrompt = `Describe a simple, photorealistic, isolated image of "${productTitle}" suitable for a pantry inventory app icon. The description should be for an image generator (like Imagen). Keep it under 40 words. Focus on the object with a plain background.`;

    const { result: promptResult } = await executeWithFallback(
      "gemini_image_prompt",
      async (model) => await model.generateContent(promptPrompt)
    );

    const imagePrompt = promptResult.response.text();
    console.log("Generated Image Prompt:", imagePrompt);

    // 2. Call Imagen API
    // We use direct fetch because the SDK support for Imagen is specific/evolving.
    // Model: Configurable via settings
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'gemini_image_generation_model' } });
    const modelName = setting?.value || "imagen-4.0-generate-001";

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;

    const payload = {
      instances: [
        { prompt: imagePrompt }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1"
      }
    };

    const imgRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!imgRes.ok) {
      const errText = await imgRes.text();
      throw new Error(`Imagen API failed: ${imgRes.status} ${imgRes.statusText} - ${errText}`);
    }

    const imgData = await imgRes.json();
    // Expected format: { predictions: [ { bytesBase64Encoded: "..." } ] }
    const b64 = imgData.predictions?.[0]?.bytesBase64Encoded;

    if (!b64) {
      throw new Error("No image data returned from Imagen: " + JSON.stringify(imgData));
    }

    // 3. Save to File System and DB
    const buffer = Buffer.from(b64, 'base64');

    const file = await prisma.file.create({
      data: {
        path: `AI_Generated_${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        mimeType: "image/png"
      }
    });

    // Write to UPLOAD_DIR + file.id (as per ImageController logic)
    const filepath = path.join(UPLOAD_DIR, file.id.toString());

    console.log(`Writing generated image for Product "${productTitle}" to ${filepath} (File ID: ${file.id})`);

    // Ensure dir exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // Explicitly delete if exists (should not happen for new ID, but good for sanity)
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    // Also clear any thumbnails that might strangely exist for this ID
    const smallThumb = filepath + "_thumb_" + 150;
    const largeThumb = filepath + "_thumb_" + 200;
    if (fs.existsSync(smallThumb)) fs.unlinkSync(smallThumb);
    if (fs.existsSync(largeThumb)) fs.unlinkSync(largeThumb);

    fs.writeFileSync(filepath, buffer);

    // 4. Return the file object
    res.json({ message: "success", file });

  } catch (error: any) {
    console.error("generateProductImage error", error);
    res.status(500).json({
      message: "error",
      data: error.message
    });
  }
};

export const generateRecipeImage = async (req: Request, res: Response) => {
  try {
    const { recipeTitle } = req.body;
    if (!recipeTitle) {
      res.status(400).json({ message: "Recipe title is required" });
      return;
    }

    // 1. Generate Prompt using Text Model
    const promptPrompt = `Describe a mouth-watering, professional food photography image of the dish "${recipeTitle}". The description should be for an image generator (like Imagen). high quality, restaurant style. Keep it under 40 words.`;

    const { result: promptResult } = await executeWithFallback(
      "gemini_image_prompt",
      async (model) => await model.generateContent(promptPrompt)
    );

    const imagePrompt = promptResult.response.text();
    console.log("Generated Recipe Image Prompt:", imagePrompt);

    // 2. Call Imagen API
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'gemini_image_generation_model' } });
    const modelName = setting?.value || "imagen-4.0-generate-001";

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`;

    const payload = {
      instances: [
        { prompt: imagePrompt }
      ],
      parameters: {
        sampleCount: 1,
        // Optional: Recipes might look better in 4:3 or 16:9, but 1:1 is safe for now. 
        // Docs say aspect ratio support varies. Imagen 3 usually supports "1:1", "3:4", "4:3", "9:16", "16:9".
        aspectRatio: "16:9"
      }
    };

    const imgRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!imgRes.ok) {
      const errText = await imgRes.text();
      // If 16:9 fails (rare but possible on some models), fallback to 1:1? 
      // For now let's just throw.
      throw new Error(`Imagen API failed: ${imgRes.status} ${imgRes.statusText} - ${errText}`);
    }

    const imgData = await imgRes.json();
    const b64 = imgData.predictions?.[0]?.bytesBase64Encoded;

    if (!b64) {
      throw new Error("No image data returned from Imagen: " + JSON.stringify(imgData));
    }

    // 3. Save to File System and DB
    const buffer = Buffer.from(b64, 'base64');

    const file = await prisma.file.create({
      data: {
        path: `AI_Generated_Recipe_${recipeTitle.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        mimeType: "image/png"
      }
    });

    const filepath = path.join(UPLOAD_DIR, file.id.toString());
    console.log(`Writing generated image for Recipe "${recipeTitle}" to ${filepath} (File ID: ${file.id})`);

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    // Clear thumbnails
    const smallThumb = filepath + "_thumb_" + 150;
    const largeThumb = filepath + "_thumb_" + 200;
    if (fs.existsSync(smallThumb)) fs.unlinkSync(smallThumb);
    if (fs.existsSync(largeThumb)) fs.unlinkSync(largeThumb);

    fs.writeFileSync(filepath, buffer);

    res.json({ message: "success", file });

  } catch (error: any) {
    console.error("generateRecipeImage error", error);
    res.status(500).json({
      message: "error",
      data: error.message
    });
  }
};

export const calculateLogistics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    let mealPlans;
    if (startDate && endDate) {
      mealPlans = await prisma.mealPlan.findMany({
        where: { date: { gte: new Date(startDate), lte: new Date(endDate) } },
        include: { recipe: { include: { ingredients: true } }, product: true, reservations: true }
      });
    } else {
      mealPlans = await prisma.mealPlan.findMany({
        where: { date: { gte: new Date() } },
        include: { recipe: { include: { ingredients: true } }, product: true, reservations: true },
        take: 20
      });
    }

    // Fetch existing Shopping Trips in range (plus loop overlap?)
    // Just fetch future trips
    const existingTrips = await prisma.shoppingTrip.findMany({
      where: { date: { gte: new Date() } }
    });
    const tripContext = existingTrips.map(t => `- ID: ${t.id}, Date: ${t.date.toISOString().split('T')[0]}, Notes: ${t.notes}`).join('\n');

    const mpIds = mealPlans.map(mp => mp.id);
    if (mpIds.length > 0) {
      await prisma.stockReservation.deleteMany({
        where: { mealPlanId: { in: mpIds } }
      });
    }

    const inventoryContext = await getProductContext();

    let planContext = "Meal Plan:\n";
    for (const mp of mealPlans) {
      planContext += `- Date: ${mp.date.toISOString().split('T')[0]}, ID: ${mp.id}, Quantity: ${mp.quantity || 1} ${mp.unit || ''}\n`;
      if (mp.recipe) {
        planContext += `  Recipe: ${mp.recipe.name}\n`;
        if (mp.recipe.ingredients) {
          planContext += `  Ingredients: ${mp.recipe.ingredients.map(i => `${i.amount || ''} ${i.unit || ''} ${i.name}`).join(', ')}\n`;
        }
      } else if (mp.product) {
        planContext += `  Product: ${mp.product.title}\n`;
      }
    }

    const prompt = `
      Analyze the following Meal Plan and Current Inventory.
      Your goal is to identify which Stock Items should be reserved for each meal, AND plan the necessary Shopping Trips.
      
      For each meal plan entry:
      1. Identify the ingredients needed.
      2. Match them to available Stock Items in the Inventory.
      3. Calculate how much of each stock item to reserve.
      
      For logic planning (Shopping):
      1. Identify ingredients that are MISSING or INSUFFICIENT after reservations.
      2. Plan Shopping Trips to acquire them.
      3. CONSOLIDATE shopping trips as much as possible (e.g. one big weekly trip is better than many small ones).
      4. SCHEDULE shopping trips at least 1 DAY BEFORE the items are needed for a meal (e.g. if meal is on Friday, shop by Thursday).
      5. Use existing Shopping Trips if they meet the timing requirements.
      
      Rules:
      1. Prioritize stock items with the EARLIEST Expiration Date.
      2. If a single stock item isn't enough, use partial amounts from multiple stock items.
      3. Return a JSON structure listing reservations AND shopping trips.
      4. Generally reserve only what is needed.
      5. Do NOT plan shopping trips on the same day as the meal unless it's unavoidable.
      
      Input:
      ${planContext}

      Existing Shopping Trips:
      ${tripContext}
      
      Inventory:
      ${inventoryContext}
      
      Output JSON Format:
      {
        "reservations": [
          {
            "mealPlanId": 123,
            "stockItemId": 456,
            "amount": 2.5
          }
        ],
        "shoppingTrips": [
            {
                "date": "YYYY-MM-DD",
                "notes": "Weekly Shop",
                "existingId": 12 (optional, if using existing),
                "items": [
                    { "name": "Milk", "amount": 1, "unit": "gal" }
                ]
            }
        ]
      }
    `;

    const { result } = await executeWithFallback('gemini_logistics', async (model) => {
      return await model.generateContent(prompt);
    });

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse Gemini response", raw: text });
      return;
    }
    const data = JSON.parse(jsonMatch[0]);

    let createdCount = 0;
    // Process Reservations
    if (data.reservations && Array.isArray(data.reservations)) {
      for (const resv of data.reservations) {
        if (resv.mealPlanId && resv.stockItemId && resv.amount) {
          try {
            await prisma.stockReservation.create({
              data: {
                mealPlanId: resv.mealPlanId,
                stockItemId: resv.stockItemId,
                amount: Number(resv.amount)
              }
            });
            createdCount++;
          } catch (e) {
            console.warn(`Failed to create reservation m:${resv.mealPlanId} s:${resv.stockItemId}`, e);
          }
        }
      }
    }

    // Process Shopping Trips
    let tripsCreated = 0;
    let itemsCreated = 0;
    if (data.shoppingTrips && Array.isArray(data.shoppingTrips)) {
      for (const trip of data.shoppingTrips) {
        let tripId = trip.existingId;

        try {
          if (!tripId) {
            // Try to find an existing trip on this date first to avoid duplicates
            const tripDate = new Date(trip.date);
            // Create range for the whole day
            const startOfDay = new Date(tripDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(tripDate);
            endOfDay.setHours(23, 59, 59, 999);

            const existingTrip = await prisma.shoppingTrip.findFirst({
              where: {
                date: {
                  gte: startOfDay,
                  lte: endOfDay
                }
              }
            });

            if (existingTrip) {
              tripId = existingTrip.id;
            } else {
              // Create new trip
              const newTrip = await prisma.shoppingTrip.create({
                data: {
                  date: tripDate, // Use the parsed date
                  notes: trip.notes || "Auto-planned Shopping Trip"
                }
              });
              tripId = newTrip.id;
              tripsCreated++;
            }
          }

          if (!tripId) {
            console.warn("Could not determine trip ID, skipping items");
            continue;
          }


          // Find or create a default shopping list to attach items to (required by schema)
          let defaultList = await prisma.shoppingList.findFirst();
          if (!defaultList) {
            defaultList = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });
          }

          // Clear existing items for this trip so we don't duplicate on re-run
          if (tripId) {
            await prisma.shoppingListItem.deleteMany({
              where: { shoppingTripId: tripId }
            });
          }

          if (trip.items && Array.isArray(trip.items)) {
            // Aggregate items by name and unit
            const aggregatedItems = new Map<string, any>();

            for (const item of trip.items) {
              const key = `${item.name.toLowerCase().trim()}_${item.unit ? item.unit.toLowerCase().trim() : 'nounit'}`;
              if (aggregatedItems.has(key)) {
                const existing = aggregatedItems.get(key);
                existing.amount = (Number(existing.amount) || 0) + (Number(item.amount) || 0);
              } else {
                aggregatedItems.set(key, { ...item, amount: Number(item.amount) || 0 }); // Ensure copy and number conversion
              }
            }

            for (const item of aggregatedItems.values()) {
              await prisma.shoppingListItem.create({
                data: {
                  shoppingTripId: tripId,
                  shoppingListId: defaultList.id,
                  name: item.name,
                  quantity: item.amount || 1, // Already aggregated as number
                  unit: item.unit || null,
                  checked: false
                }
              });
              itemsCreated++;
            }
          }
        } catch (e) {
          console.warn("Failed to process shopping trip", e);
        }
      }
    }

    res.json({ message: "success", reservationsCreated: createdCount });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to calculate logistics" });
  }
};

export const getDebugLogs = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      res.status(400).json({ error: "Session ID required" });
      return;
    }

    const logs = await prisma.geminiDebugLog.findMany({
      where: { sessionId: parseInt(sessionId) },
      orderBy: { requestTimestamp: 'asc' }
    });

    res.json({ data: logs });
  } catch (err) {
    console.error("Error fetching debug logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

// Helper to adapt tools from old SDK format to new SDK format
// Handles:
// 1. Rename 'parameters' -> 'parametersJsonSchema'
// 2. Lowercase 'type' values (OBJECT -> object)
function adaptTools(tools: any[]): any[] {
  if (!tools || !Array.isArray(tools)) return tools;
  return tools.map((tool: any) => {
    if (tool.functionDeclarations) {
      return {
        functionDeclarations: tool.functionDeclarations.map((fn: any) => {
          const newFn = { ...fn };

          // Rename parameters -> parametersJsonSchema
          if (newFn.parameters) {
            newFn.parametersJsonSchema = newFn.parameters;
            delete newFn.parameters;
          }

          // Helper to recursively lowercase types
          const normalizeSchema = (schema: any) => {
            if (!schema || typeof schema !== 'object') return;

            if (schema.type && typeof schema.type === 'string') {
              schema.type = schema.type.toLowerCase();
            }

            if (schema.properties) {
              Object.values(schema.properties).forEach(normalizeSchema);
            }
            if (schema.items) {
              normalizeSchema(schema.items);
            }
          };

          if (newFn.parametersJsonSchema) {
            // Clone schema to avoid mutating original if referenced elsewhere
            newFn.parametersJsonSchema = JSON.parse(JSON.stringify(newFn.parametersJsonSchema));
            normalizeSchema(newFn.parametersJsonSchema);
          }

          return newFn;
        })
      };
    }
    return tool;
  });
}
