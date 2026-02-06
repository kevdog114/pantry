import { GoogleGenerativeAI, Content, SchemaType, EnhancedGenerateContentResponse, GenerateContentStreamResult } from "@google/generative-ai";
import { GoogleAICacheManager, CachedContent } from "@google/generative-ai/server";
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

dotenv.config();


const gemini_api_key = process.env.GEMINI_API_KEY;
if (!gemini_api_key) {
  throw new Error("GEMINI_API_KEY is not set");
}
const googleAI = new GoogleGenerativeAI(gemini_api_key);
const cacheManager = new GoogleAICacheManager(gemini_api_key);

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
let currentCache: CachedContent | null = null;
let currentCacheHash: string | null = null;
let cacheExpiresAt: Date | null = null;

const geminiConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 4096,
};

// Helper to get the model based on feature setting or fallback
export async function getGeminiModel(featureKey: string, fallbackModelName: string = DEFAULT_FALLBACK_MODEL) {
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

  return {
    model: googleAI.getGenerativeModel({
      model: modelName,
      ...geminiConfig,
    }),
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
    // Check for 404 or other errors indicating model unavailability
    // The SDK might throw different errors, but typically 404 or specific status codes indicating model not found.
    // We'll catch generic errors for now and check if it seems related to model availability or try fallback anyway.
    console.warn(`Error using model ${modelName}:`, error);

    if (modelName !== fallbackModelName) {
      console.warn(`Attempting fallback to ${fallbackModelName}`);
      const fallbackModel = googleAI.getGenerativeModel({
        model: fallbackModelName,
        ...geminiConfig,
      });
      try {
        const result = await operation(fallbackModel);
        return {
          result,
          warning: `Preferred model '${modelName}' was unavailable. Fell back to '${fallbackModelName}'.`
        };
      } catch (fallbackError) {
        throw fallbackError; // Fallback also failed
      }
    }
    throw error; // Initial model was already fallback or error is fatal
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
): Promise<{ streamResult: GenerateContentStreamResult; finalModelName: string }> {
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

  const routerModel = googleAI.getGenerativeModel({
    model: routerModelName,
    ...geminiConfig
  });

  console.log(`[Auto Router] Attempting direct answer with ${routerModelName}...`);

  try {
    // 3. Start Flash Stream
    const routerStreamResult = await routerModel.generateContentStream({
      contents,
      systemInstruction: routingInstruction,
      tools,
    });

    // 4. Robust Peeking: Buffer chunks until we have enough text to check for escalation or confirm regular response
    const iterator = routerStreamResult.stream[Symbol.asyncIterator]();
    let accumulatedText = "";
    const bufferedResults: any[] = [];
    let isEscalating = false;

    // Buffer up to ~50 chars or until we see the token.
    while (true) {
      const next = await iterator.next();
      if (next.done) break;

      bufferedResults.push(next);
      accumulatedText += next.value.text();

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
      const proModel = googleAI.getGenerativeModel({
        model: proModelName,
        ...geminiConfig
      });

      const proStreamResult = await proModel.generateContentStream({
        contents,
        systemInstruction, // Use original instruction without routing directive
        tools
      });

      // BACKGROUND: Continue consuming Flash stream to get summary
      (async () => {
        try {
          console.log("[Auto Router] Background: Consuming Flash stream for summary...");
          let buffer = accumulatedText;
          let next = await iterator.next();
          while (!next.done) {
            buffer += next.value.text();
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
        const text = result.value.text();
        const safeText = processChunk(text);
        if (safeText) {
          yield {
            text: () => safeText,
            functionCalls: result.value.functionCalls,
            functionResponse: result.value.functionResponse
          } as any;
        }
      }

      let next = await iterator.next();
      while (!next.done) {
        const text = next.value.text();
        const safeText = processChunk(text);
        if (safeText) {
          yield {
            text: () => safeText,
            functionCalls: next.value.functionCalls,
            functionResponse: next.value.functionResponse
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
      streamResult: {
        stream: combinedStream() as any,
        response: routerStreamResult.response
      },
      finalModelName: routerModelName
    };

  } catch (error) {
    console.error("[Auto Router] Router failed, falling back to Pro:", error);
    const proModel = googleAI.getGenerativeModel({
      model: proModelName,
      ...geminiConfig
    });
    const proStreamResult = await proModel.generateContentStream({
      contents,
      systemInstruction,
      tools
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
    if (currentCache) {
      console.log(`[Context Cache] Hash Check - Current: ${currentCacheHash}, New: ${contextHash}`);
      console.log(`[Context Cache] Expiration Check - Expires: ${cacheExpiresAt?.toISOString()}, Now: ${now.toISOString()}`);
      if (currentCacheHash === contextHash && cacheExpiresAt && cacheExpiresAt > now) {
        console.log(`[Context Cache] HIT - Using existing cache: ${currentCache.name}`);
        return { name: currentCache.name, isHit: true };
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
    if (currentCache && currentCache.name && currentCacheHash !== contextHash) {
      try {
        console.log(`[Context Cache] Context changed, deleting old cache: ${currentCache.name}`);
        await cacheManager.delete(currentCache.name);
      } catch (e) {
        console.warn("[Context Cache] Failed to delete old cache:", e);
      }
    }

    // Create a new cache
    console.log(`[Context Cache] Creating new cache for model ${modelName}`);

    // The cache needs some initial content to cache along with system instruction
    // We'll cache the system instruction and a priming acknowledgment
    const cache = await cacheManager.create({
      model: modelName,
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
      ttlSeconds: 3600 // 1 hour TTL
    });

    currentCache = cache;
    currentCacheHash = contextHash;
    cacheExpiresAt = new Date(now.getTime() + 3600 * 1000); // 1 hour from now

    console.log(`[Context Cache] Cache created: ${cache.name}, expires: ${cacheExpiresAt.toISOString()}`);
    return { name: cache.name, isHit: false };

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
}> {
  const { model, modelName } = await getGeminiModel(featureKey);

  try {
    const cacheResult = await getOrCreateContextCache(modelName, additionalContext);

    if (cacheResult) {
      const { name, isHit } = cacheResult;

      // Get the full cache object to pass to the model
      const cachedContent = await cacheManager.get(name);

      // Create a model that uses the cached content
      const cachedModel = googleAI.getGenerativeModelFromCachedContent(cachedContent);
      return { model: cachedModel, modelName, usingCache: isHit };
    }
  } catch (error) {
    console.warn("[Context Cache] Failed to get cached model, falling back to regular model:", error);
  }

  // Build system instruction for non-cached fallback
  const systemInstruction = await buildSystemInstruction(additionalContext);
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

export const post = async (req: Request, res: Response) => {
  try {
    let { prompt, history = [], sessionId, additionalContext, entityType, entityId } = req.body as {
      prompt: string;
      history: Content[];
      sessionId?: number | string;
      additionalContext?: string;
      entityType?: string;
      entityId?: number | string;
    };

    if (sessionId) {
      sessionId = parseInt(sessionId as string, 10);
    }

    // --- SMART CHAT LOCAL INTENT PROCESSING ---
    try {
      const intentRes = await intentEngine.process(prompt);
      // Threshold 0.8 to be safe
      if (intentRes.intent === 'shopping.add' && intentRes.score > 0.8) {
        console.log(`[SmartChat] Detected local intent: ${intentRes.intent}`);

        // Extract Item Name (Regex Fallback as NLP entities not fully trained)
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
            itemToAdd = match[1].trim();
            // Clean up common suffix punctuation if user typed "buy milk."
            itemToAdd = itemToAdd.replace(/[.!?]$/, '');
            break;
          }
        }

        if (itemToAdd) {
          // Verify session exists or create one to maintain chat history appearance
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
              where: { id: sessionId as number },
              data: { updatedAt: new Date() }
            });
          }

          // Save User Message
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId as number,
              sender: 'user',
              type: 'chat',
              content: prompt
            }
          });

          // Logic: Add to Shopping List
          let shoppingList = await prisma.shoppingList.findFirst();
          if (!shoppingList) {
            shoppingList = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });
          }

          const existingItem = await prisma.shoppingListItem.findFirst({
            where: {
              shoppingListId: shoppingList.id,
              name: itemToAdd
            }
          });

          if (existingItem) {
            await prisma.shoppingListItem.update({
              where: { id: existingItem.id },
              data: { quantity: (existingItem.quantity || 1) + 1 }
            });
          } else {
            await prisma.shoppingListItem.create({
              data: {
                shoppingListId: shoppingList.id,
                name: itemToAdd,
                quantity: 1
              }
            });
          }

          const botResponseText = `I've added **${itemToAdd}** to your shopping list.`;

          // Save Bot Message
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId as number,
              sender: 'model', // Use 'model' to appear as the AI
              type: 'chat',
              content: botResponseText
            }
          });

          // Return JSON response format
          return res.json({
            message: "success",
            sessionId: sessionId,
            result: {
              items: [
                {
                  type: 'chat',
                  content: botResponseText
                }
              ]
            }
          });
        }
      }
    } catch (err) {
      console.warn("Intent engine processing failed, falling back to Gemini", err);
    }
    // --- END SMART CHAT LOCAL PROCESSING ---

    // Handle Image Upload
    let imageFilename: string | null = null;
    let imageMimeType: string | null = null;
    let imagePart: any = null;

    if (req.files && req.files.image) {
      const image = req.files.image as UploadedFile;
      const ext = path.extname(image.name);
      imageFilename = `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
      imageMimeType = image.mimetype;

      storeFile(image.tempFilePath, imageFilename);

      // Prepare for Gemini
      imagePart = fileToGenerativePart(path.join(UPLOAD_DIR, imageFilename), imageMimeType);
    }

    // If no sessionId, create a new session
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
      // Load history from DB
      const messages = await prisma.chatMessage.findMany({
        where: { sessionId: sessionId as number },
        orderBy: { createdAt: 'asc' }
      });

      // Convert messages to history Content[] - filter out tool_call types (UI only)
      history = messages
        .filter(msg => msg.type !== 'tool_call')
        .map(msg => {
          let text = msg.content || '';
          // If it was a recipe, we construct a JSON representation to simulate what the model outputted
          if (msg.type === 'recipe' && msg.recipeData) {
            text = JSON.stringify({
              items: [{
                type: 'recipe',
                recipe: JSON.parse(msg.recipeData)
              }]
            });
          }

          const parts: any[] = [];
          if (text) {
            parts.push({ text });
          }

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

          return {
            role: msg.sender,
            parts: parts
          } as Content;
        }).filter(content => content.parts.length > 0);
    }

    // Save User Message to DB
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionId as number,
        sender: 'user',
        type: 'chat',
        content: prompt,
        imageUrl: imageFilename
      }
    });

    await prisma.chatSession.update({
      where: { id: sessionId as number },
      data: { updatedAt: new Date() }
    });

    // Try to get a cached model for better performance
    const contextStart = Date.now();
    const { model: cachedModel, modelName, usingCache, systemInstruction } = await getCachedModel("gemini_chat_model", additionalContext);
    const contextDuration = Date.now() - contextStart;
    console.log(`Context ${usingCache ? '(cached)' : '(fresh)'} generation time: ${contextDuration}ms`);

    const modelAck = {
      role: "model",
      parts: [
        {
          text: "Understood. I will always return valid JSON with a root 'items' array containing objects with 'type': 'recipe' or 'type': 'chat'.",
        },
      ],
    };

    const userParts: any[] = [{ text: prompt }];
    if (imagePart) {
      userParts.push(imagePart);
    }

    // Build contents based on whether we're using cache
    let contents: Content[];
    if (usingCache) {
      // When using cache, the system instruction is already cached
      // We only need to include the priming exchange (which is also cached) + history + new prompt
      contents = [
        ...history,
        {
          role: "user",
          parts: userParts,
        },
      ];
      console.log("[Context Cache] Using cached context, contents length:", contents.length);
    } else {
      // Non-cached: include full system instruction
      contents = [
        {
          role: "user",
          parts: [{ text: systemInstruction! }]
        },
        modelAck,
        ...history,
        {
          role: "user",
          parts: userParts,
        },
      ];
      console.log("[Context Cache] Using non-cached context, contents length:", contents.length);
    }

    // Tool display names for friendly UI messages
    const toolDisplayNames: Record<string, string> = {
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
      removeFromShoppingList: "Removing from shopping list...",
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
      deleteTimer: "Stopping timer..."
    };

    const inventoryTools = [
      {
        functionDeclarations: [
          // NEW CONTEXT TOOLS
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
          },
          // EXISTING TOOLS
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
          },
          {
            name: "getShoppingList",
            description: "Get the current shopping list items.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
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
            name: "removeFromShoppingList",
            description: "Remove an item from the shopping list by item name.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                item: { type: SchemaType.STRING, description: "Name of the item to remove" }
              },
              required: ["item"]
            }
          },
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
                      productId: { type: SchemaType.INTEGER, description: "Optional: ID of matching product in inventory" }
                    },
                    required: ["name"]
                  }
                },
                steps: {
                  type: SchemaType.ARRAY,
                  description: "List of step-by-step instructions",
                  items: { type: SchemaType.STRING }
                },
                printSteps: {
                  type: SchemaType.ARRAY,
                  description: "Simplified, concise steps optimized for printing on a receipt printer.",
                  items: { type: SchemaType.STRING }
                },
                prepTime: { type: SchemaType.NUMBER, description: "Prep time in minutes" },
                cookTime: { type: SchemaType.NUMBER, description: "Cook time in minutes" },
                yield: { type: SchemaType.STRING, description: "Servings/Yield" }
              },
              required: ["title", "ingredients", "steps"]
            }
          },
          {
            name: "getRecipeDetails",
            description: "Get the full details (ingredients, steps) of a recipe by ID.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                recipeId: { type: SchemaType.INTEGER, description: "ID of the recipe" }
              },
              required: ["recipeId"]
            }
          },
          {
            name: "printReceipt",
            description: "Print a receipt, shopping list, or recipe to the Kiosk thermal printer.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING, description: "Title of the receipt" },
                text: { type: SchemaType.STRING, description: "Main body text or description" },
                items: {
                  type: SchemaType.ARRAY,
                  description: "List of items to print (optional)",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      name: { type: SchemaType.STRING },
                      quantity: { type: SchemaType.STRING }
                    },
                    required: ["name"]
                  }
                },
                footer: { type: SchemaType.STRING, description: "Optional footer text" }
              },
              required: ["title"]
            }
          }
        ]
      },
      {
        functionDeclarations: [
          {
            name: "createCookingInstruction",
            description: "Save specific cooking instructions for a product (e.g. Microwave vs Oven).",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                productId: { type: SchemaType.INTEGER, description: "ID of the product these instructions belong to." },
                method: { type: SchemaType.STRING, description: "Cooking method or title (e.g. 'Microwave Instructions')" },
                description: { type: SchemaType.STRING, description: "Brief description of the method." },
                steps: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "List of instruction steps."
                },
                prepTime: { type: SchemaType.NUMBER },
                cookTime: { type: SchemaType.NUMBER }
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
                body: { type: SchemaType.STRING, description: "Notification body text" }
              },
              required: ["title", "body"]
            }
          }
        ]
      }
    ];

    async function handleToolCall(name: string, args: any): Promise<any> {
      console.log(`Executing tool ${name} with args:`, args);
      try {
        switch (name) {
          // NEW CONTEXT TOOL HANDLERS
          case "getWeatherForecast":
            const days = args.days || 5;
            try {
              const service = new WeatherService();
              const today = new Date();
              const endDate = new Date();
              endDate.setDate(today.getDate() + days - 1);
              const forecasts = await service.getForecast(today, endDate);
              if (!forecasts || forecasts.length === 0) {
                return { message: "No weather forecast available." };
              }
              return {
                forecasts: forecasts.map(f => ({
                  date: f.date.toISOString().split('T')[0],
                  condition: f.condition,
                  highTemp: f.highTemp,
                  lowTemp: f.lowTemp,
                  precipitationChance: f.precipitationChance
                }))
              };
            } catch (e) {
              console.error("Weather tool error:", e);
              return { error: "Weather service unavailable" };
            }

          case "getFamilyPreferences":
            const members = await prisma.familyMember.findMany();
            const generalPref = await prisma.systemSetting.findUnique({
              where: { key: 'family_general_preferences' }
            });
            return {
              generalPreferences: generalPref?.value || null,
              members: members.map(m => ({
                name: m.name,
                dateOfBirth: m.dateOfBirth ? m.dateOfBirth.toISOString().split('T')[0] : null,
                preferences: m.preferences
              }))
            };

          case "getAvailableEquipment":
            const equipment = await prisma.equipment.findMany();
            return {
              equipment: equipment.map(e => ({
                id: e.id,
                name: e.name,
                notes: e.notes
              }))
            };

          case "searchInventory":
            const searchQuery = args.query?.toLowerCase() || '';
            const searchProducts = await prisma.product.findMany({
              where: {
                OR: [
                  { title: { contains: searchQuery } },
                  { tags: { some: { name: { contains: searchQuery } } } }
                ]
              },
              include: {
                stockItems: { include: { reservations: true } },
                tags: { select: { name: true } }
              }
            });
            return {
              products: searchProducts.map(p => {
                const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                const totalReserved = p.stockItems.reduce((sum, s) =>
                  sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                const earliestExp = p.stockItems
                  .filter(s => s.expirationDate)
                  .sort((a, b) => (a.expirationDate?.getTime() || 0) - (b.expirationDate?.getTime() || 0))[0]?.expirationDate;
                return {
                  id: p.id,
                  title: p.title,
                  totalQuantity: totalQty,
                  reservedQuantity: totalReserved,
                  availableQuantity: totalQty - totalReserved,
                  trackCountBy: p.trackCountBy,
                  tags: p.tags.map(t => t.name),
                  earliestExpiration: earliestExp ? earliestExp.toISOString().split('T')[0] : null
                };
              })
            };

          case "getAllProducts":
            const allProducts = await prisma.product.findMany({
              include: {
                stockItems: { include: { reservations: true } },
                tags: { select: { name: true } }
              }
            });
            return {
              products: allProducts.map(p => {
                const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                const totalReserved = p.stockItems.reduce((sum, s) =>
                  sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                return {
                  id: p.id,
                  title: p.title,
                  totalQuantity: totalQty,
                  availableQuantity: totalQty - totalReserved,
                  trackCountBy: p.trackCountBy,
                  tags: p.tags.map(t => t.name)
                };
              })
            };

          case "getStockExpiringSoon":
            const lookAheadDays = args.days || 7;
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + lookAheadDays);
            const expiringStock = await prisma.stockItem.findMany({
              where: {
                expirationDate: {
                  gte: new Date(),
                  lte: futureDate
                },
                quantity: { gt: 0 }
              },
              include: { product: { select: { id: true, title: true } } },
              orderBy: { expirationDate: 'asc' }
            });
            return {
              expiringItems: expiringStock.map(s => ({
                productId: s.product.id,
                productTitle: s.product.title,
                stockId: s.id,
                quantity: s.quantity,
                unit: s.unit,
                expirationDate: s.expirationDate?.toISOString().split('T')[0],
                frozen: s.frozen,
                opened: s.opened
              }))
            };

          // EXISTING TOOL HANDLERS
          case "getStockEntries":
            const product = await prisma.product.findUnique({
              where: { id: args.productId },
              include: { stockItems: true }
            });
            if (!product) return { error: "Product not found" };
            return { stockItems: product.stockItems };

          case "createStockEntry":
            // Validate product exists logic
            const targetProduct = await prisma.product.findUnique({ where: { id: args.productId } });
            if (!targetProduct) return { error: "Product not found." };

            const newItem = await prisma.stockItem.create({
              data: {
                productId: args.productId,
                quantity: args.quantity,
                unit: args.unit || null,
                expirationDate: args.expirationDate ? new Date(args.expirationDate.includes('T') ? args.expirationDate : args.expirationDate + 'T12:00:00') : null,
                frozen: args.frozen || false,
                opened: args.opened || false
              }
            });
            return { message: "Stock item created. Please confirm this action to the user.", item: newItem };

          case "editStockEntry":
            const currentItem = await prisma.stockItem.findUnique({
              where: { id: args.stockId },
              include: { product: true }
            });
            if (!currentItem) return { error: "Stock item not found" };

            const formattedData: any = {};
            if (args.quantity !== undefined && args.quantity !== null) formattedData.quantity = args.quantity;
            if (args.unit !== undefined && args.unit !== null) formattedData.unit = args.unit;

            // Handle explicit date set
            if (args.expirationDate) {
              formattedData.expirationDate = new Date(args.expirationDate.includes('T') ? args.expirationDate : args.expirationDate + 'T12:00:00');
            }

            // Helpers to match frontend logic
            const addDays = (dt: Date, days: number): Date => {
              const newDt = new Date(dt);
              newDt.setDate(newDt.getDate() + days);
              return newDt;
            };

            const daysBetween = (dt1: Date, dt2: Date): number => {
              const one = new Date(dt1); one.setHours(0, 0, 0, 0);
              const two = new Date(dt2); two.setHours(0, 0, 0, 0);
              // Difference in milliseconds
              const diff = (one.getTime() - two.getTime());
              // Convert to days
              return Math.ceil(diff / (1000 * 60 * 60 * 24));
            };

            const now = new Date();
            // Determine effective current state for logic
            const isFrozen = (args.frozen !== undefined && args.frozen !== null) ? args.frozen : currentItem.frozen;
            const isOpened = (args.opened !== undefined && args.opened !== null) ? args.opened : currentItem.opened;

            // --- OPENED Logic ---
            if (args.opened !== undefined && args.opened !== null) {
              formattedData.opened = args.opened;
              // If transitioning to Opened
              if (args.opened && !currentItem.opened) {
                if (currentItem.product.openedLifespanDays !== null) {
                  if (isFrozen) {
                    // If frozen, we just store the reduced lifespan to apply after thaw
                    formattedData.expirationExtensionAfterThaw = currentItem.product.openedLifespanDays;
                  } else {
                    // If not frozen, apply immediately
                    formattedData.expirationDate = addDays(now, currentItem.product.openedLifespanDays);
                  }
                }
              }
            }

            // --- FROZEN Logic ---
            if (args.frozen !== undefined && args.frozen !== null) {
              formattedData.frozen = args.frozen;

              // Freezing
              if (args.frozen && !currentItem.frozen) {
                if (currentItem.product.freezerLifespanDays !== null) {
                  // Calculate remaining fresh days to store for later thawing
                  // Use the expiration date that is currently set (or being set)
                  const currentExp = formattedData.expirationDate || currentItem.expirationDate;
                  if (currentExp) {
                    formattedData.expirationExtensionAfterThaw = daysBetween(currentExp, now);
                  }
                  // Set expiration to freezer lifespan
                  formattedData.expirationDate = addDays(now, currentItem.product.freezerLifespanDays);
                }
              }
              // Thawing
              else if (!args.frozen && currentItem.frozen) {
                // Restore remaining days if available
                // We check currentItem.expirationExtensionAfterThaw mainly, or if we just set it in this same call (unlikely edge case but possible)
                const extDays = (formattedData.expirationExtensionAfterThaw !== undefined) ? formattedData.expirationExtensionAfterThaw : currentItem.expirationExtensionAfterThaw;

                if (extDays !== null && extDays !== undefined) {
                  formattedData.expirationDate = addDays(now, extDays);
                }
              }
            }

            const updated = await prisma.stockItem.update({
              where: { id: args.stockId },
              data: formattedData
            });
            return { message: "Updated. Please confirm to the user.", item: updated };

          case "deleteStockEntry":
            await prisma.stockItem.delete({ where: { id: args.stockId } });
            return { message: "Deleted stock item " + args.stockId + ". Please confirm to the user." };

          case "getShoppingList":
            const list = await prisma.shoppingList.findFirst({
              include: { items: true }
            });
            return list ? list.items : [];


          case "addToShoppingList":
            let shoppingList = await prisma.shoppingList.findFirst();
            if (!shoppingList) {
              shoppingList = await prisma.shoppingList.create({ data: { name: "My Shopping List" } });
            }

            // Check if item already exists to update quantity instead of duplicating
            const existingItem = await prisma.shoppingListItem.findFirst({
              where: {
                shoppingListId: shoppingList.id,
                name: args.item
              }
            });


            if (existingItem) {
              const updatedItem = await prisma.shoppingListItem.update({
                where: { id: existingItem.id },
                data: {
                  quantity: args.quantity || 1,
                  unit: args.unit || existingItem.unit
                }
              });
              return { message: "Updated shopping list item quantity. Please confirm this to the user.", item: updatedItem };
            }

            const newShoppingItem = await prisma.shoppingListItem.create({
              data: {
                shoppingListId: shoppingList.id,
                name: args.item,
                quantity: args.quantity || 1,
                unit: args.unit || null
              }
            });
            return { message: "Added to shopping list. Please confirm this to the user.", item: newShoppingItem };

          case "removeFromShoppingList":
            const sl = await prisma.shoppingList.findFirst();
            if (!sl) return { error: "No shopping list found" };

            const itemToDelete = await prisma.shoppingListItem.findFirst({
              where: {
                shoppingListId: sl.id,
                name: {
                  contains: args.item
                }
              }
            });

            if (itemToDelete) {
              await prisma.shoppingListItem.delete({ where: { id: itemToDelete.id } });
              return { message: `Removed ${itemToDelete.name} from shopping list. Please confirm to the user.` };
            }
            return { error: `Item ${args.item} not found in shopping list.` };

          case "getProducts":
            const queryProducts = await prisma.product.findMany({
              where: {
                title: {
                  contains: args.query
                }
              },
              select: { id: true, title: true }
            });
            return queryProducts;

          case "getRecipes":
            const recipes = await prisma.recipe.findMany({
              where: {
                name: {
                  contains: args.query
                }
              },
              select: { id: true, name: true }
            });
            return recipes;

          case "getMealPlan":
            const start = new Date(args.startDate);
            const end = new Date(args.endDate);
            end.setHours(23, 59, 59);

            const plans = await prisma.mealPlan.findMany({
              where: {
                date: { gte: start, lte: end }
              },
              include: { recipe: { select: { name: true } } }
            });
            return plans.map(p => ({
              id: p.id,
              date: p.date.toISOString().split('T')[0],
              recipeName: p.recipe.name,
              recipeId: p.recipeId
            }));

          case "addToMealPlan":
            // Fix Timezone: Append T12:00:00 so it falls in the middle of the day, 
            // avoiding UTC 00:00 rolling back to previous day in Western timezones.
            const dateStr = args.date.includes('T') ? args.date : `${args.date}T12:00:00`;

            if (!args.recipeId && !args.productId) {
              return { error: "You must provide either a recipeId or a productId." };
            }

            const newPlan = await prisma.mealPlan.create({
              data: {
                date: new Date(dateStr),
                recipeId: args.recipeId,
                productId: args.productId
              }
            });
            return { message: "Added meal plan. Please confirm this to the user.", planId: newPlan.id };

          case "removeFromMealPlan":
            await prisma.mealPlan.delete({ where: { id: args.mealPlanId } });
            return { message: "Removed meal from plan. Please confirm to the user." };

          case "moveMealPlan":
            await prisma.mealPlan.update({
              where: { id: args.mealPlanId },
              data: { date: new Date(args.newDate) }
            });
            return { message: "Moved meal plan. Please confirm to the user." };

          case "createRecipe":
            const newRecipe = await prisma.recipe.create({
              data: {
                name: args.title,
                description: args.description || '',
                source: 'Gemini Assistant',
                prepTime: args.prepTime,
                cookTime: args.cookTime,
                yield: args.yield,
                totalTime: (args.prepTime || 0) + (args.cookTime || 0),
                ingredientText: args.ingredients.map((i: any) => `${i.amount || ''} ${i.unit || ''} ${i.name}`).join('\n'),
                receiptSteps: args.printSteps ? JSON.stringify({ steps: args.printSteps }) : null,
                steps: {
                  create: (args.steps || []).map((step: string, idx: number) => ({
                    stepNumber: idx + 1,
                    instruction: step
                  }))
                },
                ingredients: {
                  create: (args.ingredients || []).map((ing: any) => ({
                    name: ing.name,
                    amount: ing.amount,
                    unit: ing.unit,
                    productId: ing.productId
                  }))
                }
              }
            });
            // Trigger AI enrichment in background (or await if we want to ensure it's done)
            // Since we are inside a tool call, waiting is safer to ensure consistency
            try {
              const mappedSteps = (args.steps || []).map((s: string) => ({ instruction: s }));
              const mappedIngs = args.ingredients || [];

              const [receiptSteps, safeTemps, quickActions] = await Promise.all([
                generateReceiptSteps(newRecipe.name, mappedIngs, mappedSteps),
                determineSafeCookingTemps(mappedIngs),
                determineQuickActions(newRecipe.name, mappedIngs, mappedSteps)
              ]);

              const updates: any = {};
              if (receiptSteps) updates.receiptSteps = receiptSteps;
              if (safeTemps.length > 0) {
                updates.safeTemps = { create: safeTemps };
              }
              if (quickActions.length > 0) {
                updates.quickActions = { create: quickActions };
              }

              if (Object.keys(updates).length > 0) {
                await prisma.recipe.update({
                  where: { id: newRecipe.id },
                  data: updates
                });
              }

            } catch (err) {
              console.error("Failed to enrich Gemini-created recipe:", err);
            }

            return { message: "Recipe created successfully. ID: " + newRecipe.id + ". Please confirm creation to the user.", recipeId: newRecipe.id };

          case "printReceipt":
            try {
              const io = req.app.get("io");
              if (!io) return { error: "Socket.io service unavailable" };

              const uId = (req.user as any)?.id;
              if (!uId) {
                console.warn("[Gemini] printReceipt called but no user ID found in request.");
                return { error: "User context not found. Cannot identify kiosk." };
              }

              const kiosks = await prisma.kiosk.findMany({
                where: { userId: uId },
                include: { devices: true }
              });

              if (!kiosks || kiosks.length === 0) return { error: "No Kiosks found for your account." };

              // Find a printer
              let selectedKioskId = null;
              let selectedPrinterId = null;

              // 1. Look for explicit RECEIPT_PRINTER
              for (const k of kiosks) {
                const printer = k.devices.find(d => d.type === 'RECEIPT_PRINTER');
                if (printer) {
                  selectedKioskId = k.id;
                  try {
                    const det = JSON.parse(printer.details || '{}');
                    selectedPrinterId = det.identifier;
                  } catch { }
                  break;
                }
              }

              // 2. Fallback to any PRINTER
              if (!selectedKioskId) {
                for (const k of kiosks) {
                  const printer = k.devices.find(d => d.type === 'PRINTER');
                  if (printer) {
                    selectedKioskId = k.id;
                    try {
                      const det = JSON.parse(printer.details || '{}');
                      if (det.identifier) selectedPrinterId = det.identifier;
                    } catch { }
                    break;
                  }
                }
              }

              // 3. Fallback to just the Last Active Kiosk (Bridge might default the printer)
              if (!selectedKioskId) {
                kiosks.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
                selectedKioskId = kiosks[0].id; // Try the active one
              }

              console.log(`[Gemini] Printing receipt to Kiosk ${selectedKioskId}, Printer ${selectedPrinterId}`);

              io.to(`kiosk_device_${selectedKioskId}`).emit('print_label', {
                type: 'RECEIPT',
                printerId: selectedPrinterId,
                requestId: `gemini-${Date.now()}`,
                data: {
                  title: args.title,
                  text: args.text || '',
                  items: args.items || [],
                  footer: args.footer || 'Generated by Gemini'
                }
              });

              return { message: "Print command sent to Kiosk. Please confirm this action to the user." };
            } catch (err: any) {
              console.error("[Gemini] printReceipt error:", err);
              return { error: "Failed to process print request: " + err.message };
            }

          case "getRecipeDetails":
            const fullRecipe = await prisma.recipe.findUnique({
              where: { id: args.recipeId },
              include: { ingredients: true, steps: true }
            });
            if (!fullRecipe) return { error: "Recipe not found" };
            return fullRecipe;

          case "getTimers":
            const activeTimers = await prisma.timer.findMany({
              where: { status: "RUNNING" }
            });
            const nowTime = new Date().getTime();
            const timersWithRemaining = activeTimers.map((t: any) => {
              const start = new Date(t.startedAt).getTime();
              const end = start + (t.duration * 1000);
              const remaining = Math.max(0, Math.floor((end - nowTime) / 1000));
              return {
                id: t.id,
                name: t.name,
                durationSeconds: t.duration,
                remainingSeconds: remaining
              };
            }).filter((t: any) => t.remainingSeconds > 0);

            return { timers: timersWithRemaining };

          case "createTimer":
            const duration = args.durationSeconds;
            if (!duration || duration <= 0) return { error: "Invalid duration" };

            const newTimer = await prisma.timer.create({
              data: {
                name: args.name || "Timer",
                duration: duration,
                startedAt: new Date(),
                status: "RUNNING"
              }
            });
            return { message: "Timer started. Please confirm to the user.", timer: newTimer };

          case "deleteTimer":
            await prisma.timer.delete({ where: { id: args.timerId } });
            return { message: "Timer deleted. Please confirm to the user." };

          case "createCookingInstruction":
            // Verify product exists
            const targetProd = await prisma.product.findUnique({ where: { id: args.productId } });
            if (!targetProd) return { error: "Product not found" };

            const newInstruction = await prisma.recipe.create({
              data: {
                name: `${targetProd.title} - ${args.method}`,
                description: args.description || `Cooking instructions for ${targetProd.title}`,
                type: 'instruction',
                instructionForProductId: args.productId,
                source: 'Gemini',
                prepTime: args.prepTime,
                cookTime: args.cookTime,
                totalTime: (args.prepTime || 0) + (args.cookTime || 0),
                steps: {
                  create: (args.steps || []).map((step: string, idx: number) => ({
                    stepNumber: idx + 1,
                    instruction: step
                  }))
                }
              }
            });
            return { message: "Created cooking instruction. Please confirm to the user.", type: "instruction", instructionId: newInstruction.id };

          case "sendPushNotification":
            const uId = (req.user as any)?.id;
            if (!uId) return { error: "User context not found." };
            await sendNotificationToUser(uId, args.title, args.body);
            return { message: `Notification sent. Please confirm to the user.` };

          default:
            return { error: "Unknown tool" };
        }
      } catch (e: any) {
        return { error: e.message };
      }
    }

    const debugSetting = await prisma.systemSetting.findUnique({ where: { key: 'gemini_debug' } });
    const isGeminiDebug = debugSetting?.value === 'true';
    const dbLogSetting = await prisma.systemSetting.findUnique({ where: { key: 'gemini_debug_logging' } });
    const isDbLogging = dbLogSetting?.value === 'true';
    let printedInThisTurn = false;

    // Use cached model directly if available, otherwise fallback to executeWithFallback
    const executeGeneration = async (model: any) => {
      let currentContents = [...contents];
      let currentLoop = 0;
      const maxLoops = 5;
      let printedOnce = false;

      // Initial generation
      if (isGeminiDebug) {
        console.log("--- GEMINI DEBUG CONTEXT (Initial) ---");
        console.log(JSON.stringify(currentContents, null, 2));
        console.log("--------------------------------------");
      }


      const reqStart = Date.now();

      // Debug logging for 400 errors
      try {
        if (currentContents.length > 0 && currentContents[0].parts && currentContents[0].parts.length > 0) {
          // Check for empty/undefined text/data fields in the first part
          const p0 = currentContents[0].parts[0];
          if (!p0.text && !p0.inlineData && !p0.functionCall && !p0.functionResponse) {
            console.error("!!! DETECTED MALFORMED PART 0 in CONTENT 0 !!!", JSON.stringify(p0));
          }
        }
        // Always log the structure of the first content item to be sure
        console.log(`[Gemini Request] Contents[0] type: ${currentContents[0]?.role}, parts: ${currentContents[0]?.parts?.length}`);
      } catch (e) { }

      let responseResult = await model.generateContent({
        contents: currentContents,
        tools: inventoryTools,
        // We remove explicit JSON enforcement here to allow tool calls to happen naturally
        // The system prompt still demands JSON for the final answer.
      });
      const reqEnd = Date.now();

      if (isDbLogging) {
        try {
          // Safely serialize response
          // Note: responseResult.response may contain circular refs or methods, we want the data
          const rawResponse = responseResult.response;
          let serializedResponse = '';
          try {
            serializedResponse = JSON.stringify(rawResponse);
          } catch (e) {
            serializedResponse = "Could not serialize response: " + (e as Error).message;
          }

          await prisma.geminiDebugLog.create({
            data: {
              sessionId: sessionId as number,
              requestTimestamp: new Date(reqStart),
              responseTimestamp: new Date(reqEnd),
              durationMs: reqEnd - reqStart,
              statusCode: 200,
              requestData: JSON.stringify(currentContents),
              responseData: serializedResponse,
              toolCalls: JSON.stringify(rawResponse.functionCalls ? rawResponse.functionCalls() : [])
            }
          });
        } catch (logErr) {
          console.error("Failed to write debug log", logErr);
        }
      }

      while (currentLoop < maxLoops) {
        const response = responseResult.response;
        const calls = response.functionCalls ? response.functionCalls() : [];

        if (calls && calls.length > 0) {
          // 1. Add model's tool call message to history
          // The SDK v0.24.1 strips out thoughtSignature from response.parts, but Gemini 3 models require it.
          // We need to inject the dummy signature "skip_thought_signature_validator" per the documentation.
          let hasFunctionCallNeedingSignature = false;
          const partsWithSignature = (response.parts || []).map((part: any) => {
            const copiedPart: any = {};
            if (part.text !== undefined) copiedPart.text = part.text;
            if (part.inlineData) copiedPart.inlineData = part.inlineData;
            if (part.functionCall) {
              copiedPart.functionCall = {
                name: part.functionCall.name,
                args: part.functionCall.args
              };
              // Inject dummy signature on the first function call part
              if (!hasFunctionCallNeedingSignature) {
                hasFunctionCallNeedingSignature = true;
                copiedPart.thoughtSignature = part.thoughtSignature || "skip_thought_signature_validator";
              }
            }
            if (part.functionResponse) copiedPart.functionResponse = part.functionResponse;
            return copiedPart;
          });

          currentContents.push({
            role: "model",
            parts: partsWithSignature,
          });

          // 2. Execute tools
          const parts: any[] = [];
          for (const call of calls) {
            // Loop Protection for Printing
            if (call.name === 'printReceipt') {
              if (printedOnce) {
                parts.push({
                  functionResponse: {
                    name: call.name,
                    response: { result: { error: "You have already printed in this turn. Do not loop." } }
                  }
                });
                continue;
              }
              printedOnce = true; // Mark as printed
              printedInThisTurn = true;
            }

            const toolResult = await handleToolCall(call.name, call.args);
            parts.push({
              functionResponse: {
                name: call.name,
                response: { result: toolResult }
              }
            });
          }

          // 3. Add function responses
          currentContents.push({
            role: "function",
            parts: parts
          });

          // 4. Generate again
          if (isGeminiDebug) {
            console.log("--- GEMINI DEBUG CONTEXT (Follow-up) ---");
            console.log(JSON.stringify(currentContents, null, 2));
            console.log("--------------------------------------");
          }

          const loopReqStart = Date.now();
          responseResult = await model.generateContent({
            contents: currentContents,
            tools: inventoryTools
          });
          const loopReqEnd = Date.now();

          if (isDbLogging) {
            try {
              const rawResponse = responseResult.response;
              let serializedResponse = '';
              try {
                serializedResponse = JSON.stringify(rawResponse);
              } catch (e) {
                serializedResponse = "Could not serialize response: " + (e as Error).message;
              }

              await prisma.geminiDebugLog.create({
                data: {
                  sessionId: sessionId as number,
                  requestTimestamp: new Date(loopReqStart),
                  responseTimestamp: new Date(loopReqEnd),
                  durationMs: loopReqEnd - loopReqStart,
                  statusCode: 200,
                  requestData: JSON.stringify(currentContents),
                  responseData: serializedResponse,
                  toolCalls: JSON.stringify(rawResponse.functionCalls ? rawResponse.functionCalls() : [])
                }
              });
            } catch (logErr) {
              console.error("Failed to write debug log (loop)", logErr);
            }
          }

          currentLoop++;
        } else {
          // No more calls, this is the final response
          break;
        }
      }
      return responseResult;
    };

    // Execute with cached model or fallback
    let result: any;
    let warning: string | undefined;

    if (usingCache) {
      // Use cached model directly
      console.log("[Context Cache] Executing with cached model");
      try {
        result = await executeGeneration(cachedModel);
      } catch (cacheError) {
        console.warn("[Context Cache] Cached model execution failed, falling back:", cacheError);
        // Fall back to non-cached execution
        const fallbackResult = await executeWithFallback("gemini_chat_model", executeGeneration);
        result = fallbackResult.result;
        warning = fallbackResult.warning;
      }
    } else {
      // Use executeWithFallback for non-cached execution
      console.log("[Context Cache] Executing without cache");
      const fallbackResult = await executeWithFallback("gemini_chat_model", executeGeneration);
      result = fallbackResult.result;
      warning = fallbackResult.warning;
    }

    const response = result.response;
    let data;
    const responseText = response.text();

    // Helper to strip markdown code blocks if present
    const cleanJson = (text: string) => {
      // 1. Try to locate the JSON block specifically.
      // We look for the outer-most braces structure that looks like our schema.
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const potentialJson = text.substring(jsonStart, jsonEnd + 1);
        try {
          // Verify it parses
          JSON.parse(potentialJson);
          return potentialJson;
        } catch (e) {
          // If the substring fails, fall back to loose cleaning
        }
      }

      // Remove ```json ... ``` or just ``` ... ```
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.substring(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.substring(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      return cleaned.trim();
    };

    try {
      data = JSON.parse(cleanJson(responseText));
    } catch (e) {
      // Fallback if model fails to return JSON
      console.warn("Failed to parse JSON response, using raw text", e);
      data = {
        items: [
          {
            type: 'chat',
            content: responseText
          }
        ]
      };
    }

    // Safety Net: If printed but no items returned (model thought action was sufficient), inject confirmation
    if (printedInThisTurn) {
      if (!data.items) data.items = [];
      if (Array.isArray(data.items) && data.items.length === 0) {
        data.items.push({
          type: 'chat',
          content: "I've sent that to the printer."
        });
      }
    }

    // Save Model Response to DB
    // We need to handle multiple items in the response
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.type === 'recipe' && item.recipe) {
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId as number,
              sender: 'model',
              type: 'recipe',
              recipeData: JSON.stringify(item.recipe)
            }
          });
        } else {
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId as number,
              sender: 'model',
              type: 'chat',
              content: item.content || JSON.stringify(item)
            }
          });
        }
      }
    } else {
      // Fallback for single item or malformed structure
      // ... existing logic adaptation ...
      // If it looks like a recipe
      const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');
      if (isRecipe && data.recipe) {
        await prisma.chatMessage.create({
          data: {
            sessionId: sessionId as number,
            sender: 'model',
            type: 'recipe',
            recipeData: JSON.stringify(data.recipe)
          }
        });
      } else {
        let content = data.content;
        if (typeof content === 'object') {
          content = JSON.stringify(content, null, 2);
        } else if (!content) {
          content = JSON.stringify(data, null, 2);
        }
        await prisma.chatMessage.create({
          data: {
            sessionId: sessionId as number,
            sender: 'model',
            type: 'chat',
            content: content
          }
        });
      }
    }

    // Attempt to generate/update title if this is a new session or it looks like a default/simple title
    // We do this after the model has responded to have full context of the first turn.
    try {
      const currentSession = await prisma.chatSession.findUnique({ where: { id: sessionId as number } });
      // Update if it was just created (we assume prompt based title is temporary if we want gemini to do it)
      // or if it is "New Chat"
      if (currentSession) {
        const messageCount = await prisma.chatMessage.count({ where: { sessionId: sessionId as number } });
        // Only auto-update on the first exchange (2 messages: user + model) to avoid constantly changing titles,
        // or if the user explicitly wants us to (maybe later).
        // Let's stick to first turn logic.
        if (messageCount <= 2 || currentSession.title === 'New Chat') {
          const titlePrompt = `Based on the following conversation, generate a short, concise, and descriptive title (max 6 words). Return ONLY the title text, no quotes or "Title:".\n\nUser: ${prompt}\nInternal Model Response: ${JSON.stringify(data).substring(0, 500)}...`; // Truncate response to save tokens

          const { result: titleResult } = await executeWithFallback(
            "gemini_chat_model",
            async (model) => await model.generateContent(titlePrompt)
          );

          let newTitle = titleResult.response.text().trim();
          // Clean up quotes if present
          newTitle = newTitle.replace(/^"|"$/g, '').trim();

          if (newTitle) {
            await prisma.chatSession.update({
              where: { id: sessionId as number },
              data: { title: newTitle }
            });
          }
        }
      }
    } catch (titleError) {
      console.warn("Failed to generate chat title:", titleError);
      // Provide non-blocking failure
    }

    const usageMetadata = response.usageMetadata;

    res.json({
      message: "success",
      data: data,
      sessionId, // Return sessionId so client can update URL/state
      warning,
      meta: {
        usingCache,
        modelName,
        usageMetadata
      }
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
};

function fileToGenerativePart(filePath: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

// ==============================
// STREAMING CHAT ENDPOINT (SSE)
// ==============================

export const postStream = async (req: Request, res: Response) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
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

    if (sessionId) {
      sessionId = parseInt(sessionId as string, 10);
    }

    // --- SMART CHAT LOCAL INTENT PROCESSING ---
    try {
      const intentRes = await intentEngine.process(prompt);
      if (intentRes.intent === 'shopping.add' && intentRes.score > 0.8) {
        console.log(`[SmartChat Stream] Detected local intent: ${intentRes.intent}`);

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

        if (itemToAdd) {
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
              where: { id: sessionId as number },
              data: { updatedAt: new Date() }
            });
          }

          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId as number,
              sender: 'user',
              type: 'chat',
              content: prompt
            }
          });

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
            data: {
              sessionId: sessionId as number,
              sender: 'model',
              type: 'chat',
              content: botResponseText
            }
          });

          sendEvent('session', { sessionId });
          sendEvent('chunk', { text: botResponseText });
          sendEvent('done', {
            data: { items: [{ type: 'chat', content: botResponseText }] }
          });
          res.end();
          return;
        }
      }
    } catch (err) {
      console.warn("Intent engine processing failed (stream), falling back to Gemini", err);
    }

    // Note: Streaming does not support image uploads in this implementation
    // Images require multipart form data which is complex with SSE

    // If no sessionId, create a new session
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
      // Load history from DB
      const messages = await prisma.chatMessage.findMany({
        where: { sessionId: sessionId as number },
        orderBy: { createdAt: 'asc' }
      });

      // Check for Summary
      const chatSummary = await prisma.chatSummary.findUnique({
        where: { sessionId: sessionId as number }
      });

      if (chatSummary && chatSummary.summary) {
        console.log(`[Stream] Using Chat Summary for Session ${sessionId}`);
        history = [
          { role: "user", parts: [{ text: `[SYSTEM: CONVERSATION SUMMARY]\nThe following is a summary of the conversation history so far. Use this context to answer the latest user request.\n\n${chatSummary.summary}` }] },
          { role: "model", parts: [{ text: "Understood. I will use this summary as context." }] }
        ];
      } else {
        // Build history including tool calls for full context
        const historyItems: Content[] = [];

        for (const msg of messages) {
          if (msg.type === 'tool_call' && msg.toolCallData) {
            // Reconstruct tool call as proper functionCall/functionResponse parts
            try {
              const toolData = JSON.parse(msg.toolCallData);
              if (toolData.name && toolData.args !== undefined && toolData.result !== undefined) {
                // Model's function call part (with dummy signature for Gemini 3)
                historyItems.push({
                  role: 'model',
                  parts: [{
                    functionCall: {
                      name: toolData.name,
                      args: toolData.args
                    },
                    // Use dummy signature for historical tool calls (SDK workaround)
                    thoughtSignature: "skip_thought_signature_validator"
                  } as any]
                });
                // User's function response part
                historyItems.push({
                  role: 'user',
                  parts: [{
                    functionResponse: {
                      name: toolData.name,
                      response: { result: toolData.result }
                    }
                  }]
                });
              }
            } catch (e) {
              console.warn("Failed to parse tool call data for history:", e);
            }
          } else {
            // Regular message (user, model, recipe)
            let text = msg.content || '';
            if (msg.type === 'recipe' && msg.recipeData) {
              text = JSON.stringify({
                items: [{ type: 'recipe', recipe: JSON.parse(msg.recipeData) }]
              });
            }

            const parts: any[] = [];
            if (text) {
              parts.push({ text });
            }

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

    // Send session ID to client immediately
    sendEvent('session', { sessionId });

    // Save User Message to DB
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionId as number,
        sender: 'user',
        type: 'chat',
        content: prompt
      }
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId as number },
      data: { updatedAt: new Date() }
    });

    // Define tools for streaming (subset of full tools - read-only context tools)
    // Moved up for auto-routing
    const streamTools = [
      {
        functionDeclarations: [
          { name: "getWeatherForecast", description: "Get weather forecast.", parameters: { type: SchemaType.OBJECT, properties: { days: { type: SchemaType.INTEGER } } } },
          { name: "getFamilyPreferences", description: "Get family dietary preferences and restrictions.", parameters: { type: SchemaType.OBJECT, properties: {} } },
          { name: "getAvailableEquipment", description: "Get available cooking equipment.", parameters: { type: SchemaType.OBJECT, properties: {} } },
          { name: "searchInventory", description: "Search inventory by name or tag.", parameters: { type: SchemaType.OBJECT, properties: { query: { type: SchemaType.STRING } }, required: ["query"] } },
          { name: "getAllProducts", description: "Get all products with stock levels.", parameters: { type: SchemaType.OBJECT, properties: {} } },
          { name: "getStockExpiringSoon", description: "Get items expiring soon.", parameters: { type: SchemaType.OBJECT, properties: { days: { type: SchemaType.INTEGER } } } },
          { name: "searchRecipes", description: "Search recipes by name.", parameters: { type: SchemaType.OBJECT, properties: { query: { type: SchemaType.STRING } } } },
          { name: "getRecipeDetails", description: "Get full recipe details.", parameters: { type: SchemaType.OBJECT, properties: { recipeId: { type: SchemaType.INTEGER } }, required: ["recipeId"] } }
        ]
      }
    ];

    // Get the configured model setting
    const systemInstruction = await buildSystemInstruction(additionalContext);
    let modelSetting = "gemini-flash-latest";
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "gemini_chat_model" }
      });
      if (setting?.value) modelSetting = setting.value;
    } catch (err) {
      console.warn("Failed to get chat model setting");
    }

    let model: any;
    let finalModelName: string;
    let usingCache = false;
    let preGeneratedStreamResult: GenerateContentStreamResult | null = null;

    // Handle auto-routing
    if (modelSetting === AUTO_MODEL) {
      // Build preliminary contents for routing decision
      const preliminaryContents: Content[] = [
        ...history,
        { role: "user", parts: [{ text: prompt }] }
      ];



      const { streamResult, finalModelName: routedModelName } = await routeAndExecute(
        sessionId as number,
        systemInstruction,
        preliminaryContents,
        streamTools,
        geminiConfig,
        additionalContext
      );

      preGeneratedStreamResult = streamResult;

      finalModelName = routedModelName;
      console.log(`[Stream] Auto-routed to: ${finalModelName}`);

      // Get the routed model directly (no caching for auto to keep it simple)
      model = googleAI.getGenerativeModel({
        model: finalModelName,
        ...geminiConfig
      });
    } else {
      // Normal path: use context caching
      const cached = await getCachedModel("gemini_chat_model", additionalContext);
      model = cached.model;
      finalModelName = cached.modelName;
      usingCache = cached.usingCache;
      console.log(`[Stream] Using ${usingCache ? 'cached' : 'non-cached'} model: ${finalModelName}`);
    }

    // Send model metadata event early so UI can display it while streaming
    sendEvent('meta', { modelName: finalModelName, usingCache });

    const modelAck = {
      role: "model",
      parts: [{ text: "Understood. I will always return valid JSON with a root 'items' array containing objects with 'type': 'recipe' or 'type': 'chat'." }],
    };

    // Build contents based on whether we're using cache
    let contents: Content[];
    if (usingCache) {
      // When using cache, the system instruction is already cached
      contents = [
        ...history,
        { role: "user", parts: [{ text: prompt }] },
      ];
    } else {
      // Non-cached: include full system instruction
      // Validate system instruction is not empty
      const sysInstrText = systemInstruction && systemInstruction.trim().length > 0 ? systemInstruction : "You are a helpful assistant.";

      contents = [
        { role: "user", parts: [{ text: sysInstrText }] },
        modelAck,
        ...history,
        { role: "user", parts: [{ text: prompt }] },
      ];
    }

    // DEBUG: Log contents structure to identify 400 error cause
    try {
      if (contents.length > 0 && contents[0].parts.length > 0) {
        const p0 = contents[0].parts[0];
        // Check for empty text or missing fields
        if (!p0.text && !p0.inlineData && !p0.functionCall && !p0.functionResponse) {
          console.error("!!! [Stream] DETECTED MALFORMED PART 0 !!!", JSON.stringify(p0));
        }
        if (typeof p0.text === 'string' && p0.text.length === 0) {
          console.error("!!! [Stream] DETECTED EMPTY TEXT IN PART 0 !!!");
          // Fix it
          (p0 as any).text = " ";
        }
      }
      console.log(`[Stream] Contents prepared. Length: ${contents.length}. First Item Role: ${contents[0]?.role}`);
    } catch (e) { console.error("Debug log failed", e); }

    // Tool display names for friendly UI messages (same as in post handler)
    const toolDisplayNames: Record<string, string> = {
      getWeatherForecast: "Checking weather forecast...",
      getFamilyPreferences: "Checking family dietary preferences...",
      getAvailableEquipment: "Checking available equipment...",
      searchInventory: "Searching inventory...",
      getAllProducts: "Loading product list...",
      getStockExpiringSoon: "Checking expiration dates...",
      searchRecipes: "Searching recipes...",
      getRecipes: "Searching recipes...",
      getRecipeDetails: "Loading recipe details...",
      getStockEntries: "Loading stock entries...",
      createStockEntry: "Adding stock entry...",
      editStockEntry: "Updating stock entry...",
      deleteStockEntry: "Removing stock entry...",
      getShoppingList: "Loading shopping list...",
      addToShoppingList: "Adding to shopping list...",
      removeFromShoppingList: "Removing from shopping list...",
      getMealPlan: "Loading meal plan...",
      addToMealPlan: "Adding to meal plan...",
      removeFromMealPlan: "Removing from meal plan...",
      moveMealPlan: "Moving meal plan entry...",
      getProducts: "Searching products...",
      createRecipe: "Creating recipe...",
      printReceipt: "Sending to printer...",
      createCookingInstruction: "Saving cooking instructions...",
      sendPushNotification: "Sending notification...",
      getTimers: "Loading timers...",
      createTimer: "Starting timer...",
      deleteTimer: "Stopping timer..."
    };

    // Import the tool definitions and handler (reuse from post handler structure)
    // We'll define a minimal handleToolCall inline for streaming
    const handleStreamToolCall = async (name: string, args: any): Promise<any> => {
      console.log(`[Stream] Executing tool ${name} with args:`, args);
      try {
        switch (name) {
          case "getWeatherForecast":
            const weatherDays = args.days || 5;
            try {
              const service = new WeatherService();
              const today = new Date();
              const endDate = new Date();
              endDate.setDate(today.getDate() + weatherDays - 1);
              const forecasts = await service.getForecast(today, endDate);
              if (!forecasts || forecasts.length === 0) {
                return { message: "No weather forecast available." };
              }
              return {
                forecasts: forecasts.map(f => ({
                  date: f.date.toISOString().split('T')[0],
                  condition: f.condition,
                  highTemp: f.highTemp,
                  lowTemp: f.lowTemp,
                  precipitationChance: f.precipitationChance
                }))
              };
            } catch (e) {
              return { error: "Weather service unavailable" };
            }

          case "getFamilyPreferences":
            const members = await prisma.familyMember.findMany();
            const generalPref = await prisma.systemSetting.findUnique({
              where: { key: 'family_general_preferences' }
            });
            return {
              generalPreferences: generalPref?.value || null,
              members: members.map(m => ({
                name: m.name,
                dateOfBirth: m.dateOfBirth ? m.dateOfBirth.toISOString().split('T')[0] : null,
                preferences: m.preferences
              }))
            };

          case "getAvailableEquipment":
            const equipment = await prisma.equipment.findMany();
            return { equipment: equipment.map(e => ({ id: e.id, name: e.name, notes: e.notes })) };

          case "searchInventory":
            const searchQuery = args.query?.toLowerCase() || '';
            const searchProducts = await prisma.product.findMany({
              where: {
                OR: [
                  { title: { contains: searchQuery } },
                  { tags: { some: { name: { contains: searchQuery } } } }
                ]
              },
              include: { stockItems: { include: { reservations: true } }, tags: { select: { name: true } } }
            });
            return {
              products: searchProducts.map(p => {
                const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                const totalReserved = p.stockItems.reduce((sum, s) => sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                return {
                  id: p.id, title: p.title, totalQuantity: totalQty, availableQuantity: totalQty - totalReserved,
                  trackCountBy: p.trackCountBy, tags: p.tags.map(t => t.name)
                };
              })
            };

          case "getAllProducts":
            const allProducts = await prisma.product.findMany({
              include: { stockItems: { include: { reservations: true } }, tags: { select: { name: true } } }
            });
            return {
              products: allProducts.map(p => {
                const totalQty = p.stockItems.reduce((sum, s) => sum + s.quantity, 0);
                const totalReserved = p.stockItems.reduce((sum, s) => sum + s.reservations.reduce((rSum, r) => rSum + r.amount, 0), 0);
                return { id: p.id, title: p.title, totalQuantity: totalQty, availableQuantity: totalQty - totalReserved, tags: p.tags.map(t => t.name) };
              })
            };

          case "getStockExpiringSoon":
            const lookAheadDays = args.days || 7;
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + lookAheadDays);
            const expiringStock = await prisma.stockItem.findMany({
              where: { expirationDate: { gte: new Date(), lte: futureDate }, quantity: { gt: 0 } },
              include: { product: { select: { id: true, title: true } } },
              orderBy: { expirationDate: 'asc' }
            });
            return {
              expiringItems: expiringStock.map(s => ({
                productId: s.product.id, productTitle: s.product.title, quantity: s.quantity, unit: s.unit,
                expirationDate: s.expirationDate?.toISOString().split('T')[0], frozen: s.frozen
              }))
            };

          case "getRecipes":
          case "searchRecipes":
            const recipes = await prisma.recipe.findMany({
              where: { name: { contains: args.query || '' } },
              select: { id: true, name: true, prepTime: true, cookTime: true }
            });
            return { recipes };

          case "getRecipeDetails":
            const recipe = await prisma.recipe.findUnique({
              where: { id: args.recipeId },
              include: { ingredients: true, steps: { orderBy: { stepNumber: 'asc' } } }
            });
            if (!recipe) return { error: "Recipe not found" };
            return recipe;

          default:
            return { error: `Tool ${name} not available in streaming mode. Please try again.` };
        }
      } catch (e: any) {
        return { error: e.message };
      }
    };

    // Define tools for streaming (subset of full tools - read-only context tools)


    // Use streaming generation with tool support
    let fullText = '';
    let currentContents = [...contents];
    let loopCount = 0;
    const maxLoops = 5;

    try {
      while (loopCount < maxLoops) {
        loopCount++;

        let streamResult;

        // Use pre-generated stream from router if available (first loop only)
        if (loopCount === 1 && typeof preGeneratedStreamResult !== 'undefined' && preGeneratedStreamResult) {
          streamResult = preGeneratedStreamResult;
          preGeneratedStreamResult = null; // Use only once
        } else {
          // Log summary of contents being sent (reduced from verbose per-part logging)
          const contentSummary = currentContents.map((c: any) =>
            `${c.role}(${c.parts.length} parts${c.parts.some((p: any) => p.thoughtSignature) ? '+sig' : ''})`
          ).join(', ');
          console.log(`[Stream Loop ${loopCount}] Calling generateContentStream: [${contentSummary}]`);

          streamResult = await model.generateContentStream({
            contents: currentContents,
            tools: streamTools
          });
        }

        let hasToolCall = false;
        let toolCalls: any[] = [];

        // Stream text chunks to UI as they arrive
        for await (const chunk of streamResult.stream) {
          try {
            const chunkText = chunk.text();
            if (chunkText) {
              fullText += chunkText;
              sendEvent('chunk', { text: chunkText });
            }
          } catch (e) {
            // No text in this chunk - might be a function call, handled below
          }

          // Check for function calls in chunks to emit UI events early
          const candidate = chunk.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                const displayName = toolDisplayNames[part.functionCall.name] || `Using ${part.functionCall.name}...`;
                sendEvent('tool_call', {
                  toolCall: { name: part.functionCall.name, args: part.functionCall.args },
                  displayName
                });
              }
            }
          }
        }

        // IMPORTANT: Await the full response to get parts WITH thought_signature
        // Stream chunks don't include thought_signature, but the final response does
        const finalResponse = await streamResult.response;
        const rawResponseParts = finalResponse.candidates?.[0]?.content?.parts || [];

        // Log response summary (reduced from verbose per-part logging)
        const fcParts = rawResponseParts.filter((p: any) => p.functionCall);
        const sigParts = rawResponseParts.filter((p: any) => p.thoughtSignature);
        console.log(`[Stream Loop ${loopCount}] Response: ${rawResponseParts.length} parts, ${fcParts.length} function calls${fcParts.length > 0 ? ` (${fcParts.map((p: any) => p.functionCall.name).join(', ')})` : ''}, SDK provides signature: ${sigParts.length > 0}`);

        // IMPORTANT: Explicitly copy part properties and ensure thoughtSignature is present
        // The SDK v0.24.1 strips out thoughtSignature from the response, but Gemini 3 models require it.
        // According to Google's documentation, when signatures are missing, we can use the dummy
        // signature "skip_thought_signature_validator" to bypass validation.
        // See: https://ai.google.dev/gemini-api/docs/thought-signatures#FAQs
        let hasFunctionCallNeedingSignature = false;
        const responseParts = rawResponseParts.map((part: any, index: number) => {
          const copiedPart: any = {};
          if (part.text !== undefined) copiedPart.text = part.text;
          if (part.inlineData) copiedPart.inlineData = part.inlineData;
          if (part.functionCall) {
            copiedPart.functionCall = {
              name: part.functionCall.name,
              args: part.functionCall.args
            };
            // Gemini 3 models require thoughtSignature on the FIRST functionCall part
            if (!hasFunctionCallNeedingSignature) {
              hasFunctionCallNeedingSignature = true;
              // Check if SDK provided the signature (it currently doesn't in v0.24.1)
              if (part.thoughtSignature) {
                copiedPart.thoughtSignature = part.thoughtSignature;
              } else {
                // Inject the dummy signature as documented workaround
                // "skip_thought_signature_validator" allows requests without proper signatures
                copiedPart.thoughtSignature = "skip_thought_signature_validator";
              }
            }
          }
          if (part.functionResponse) copiedPart.functionResponse = part.functionResponse;
          return copiedPart;
        });

        // Check if there are function calls in the final response
        for (const part of responseParts) {
          if (part.functionCall) {
            hasToolCall = true;
            toolCalls.push(part.functionCall);
          }
        }

        // If there were tool calls, execute them and continue
        if (hasToolCall && toolCalls.length > 0) {
          // Add model's response to context - use the copied parts with thought_signature
          currentContents.push({
            role: "model",
            parts: responseParts // Now contains properly copied thoughtSignature
          });

          // Execute tools and add responses, tracking duration and saving to DB
          const toolResponses: any[] = [];
          for (const call of toolCalls) {
            const toolStartTime = Date.now();
            const result = await handleStreamToolCall(call.name, call.args);
            const toolDurationMs = Date.now() - toolStartTime;

            const displayName = toolDisplayNames[call.name] || `Using ${call.name}...`;

            // Save tool call to DB with full data for history reconstruction
            prisma.chatMessage.create({
              data: {
                sessionId: sessionId as number,
                sender: 'model',  // Changed from 'system' - it's the model making the call
                type: 'tool_call',
                content: displayName,
                toolCallData: JSON.stringify({
                  name: call.name,
                  displayName,
                  args: call.args,  // Include args for history reconstruction
                  result: result    // Include result for functionResponse
                }),
                toolCallDurationMs: toolDurationMs
              }
            }).catch(err => console.error("Failed to save tool call:", err));

            toolResponses.push({
              functionResponse: { name: call.name, response: { result } }
            });
          }

          currentContents.push({
            role: "user",
            parts: toolResponses
          });

          // Reset for next iteration
          fullText = '';
        } else {
          // No more tool calls, we're done
          break;
        }
      }
    } catch (streamError: any) {
      console.error("Streaming error:", streamError);
      sendEvent('error', { message: streamError.message || 'Streaming failed' });
      res.end();
      return;
    }

    // Parse the full response
    const cleanJson = (text: string) => {
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
    };

    let data;
    try {
      data = JSON.parse(cleanJson(fullText));
    } catch (e) {
      console.warn("Failed to parse JSON response (stream), using raw text", e);
      data = { items: [{ type: 'chat', content: fullText }] };
    }

    // Note: usageMetadata not available with multi-turn tool calling in streaming mode
    const usageMetadata = undefined;

    // Send final complete event with parsed data and metadata IMMEDIATELY
    // Don't wait for DB saves or title generation
    sendEvent('done', {
      data,
      meta: {
        usingCache,
        modelName: finalModelName,
        usageMetadata
      }
    });
    res.end();

    // --- ASYNC POST-PROCESSING (non-blocking) ---
    // These operations happen after the response is sent to the client

    // Save Model Response to DB (async, no await needed for client)
    const saveToDb = async () => {
      try {
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item.type === 'recipe' && item.recipe) {
              await prisma.chatMessage.create({
                data: {
                  sessionId: sessionId as number,
                  sender: 'model',
                  type: 'recipe',
                  recipeData: JSON.stringify(item.recipe),
                  modelUsed: finalModelName
                }
              });
            } else {
              await prisma.chatMessage.create({
                data: {
                  sessionId: sessionId as number,
                  sender: 'model',
                  type: 'chat',
                  content: item.content || JSON.stringify(item),
                  modelUsed: finalModelName
                }
              });
            }
          }
        } else {
          const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');
          if (isRecipe && data.recipe) {
            await prisma.chatMessage.create({
              data: {
                sessionId: sessionId as number,
                sender: 'model',
                type: 'recipe',
                recipeData: JSON.stringify(data.recipe),
                modelUsed: finalModelName
              }
            });
          } else {
            let content = data.content;
            if (typeof content === 'object') content = JSON.stringify(content, null, 2);
            else if (!content) content = JSON.stringify(data, null, 2);
            await prisma.chatMessage.create({
              data: {
                sessionId: sessionId as number,
                sender: 'model',
                type: 'chat',
                content: content,
                modelUsed: finalModelName
              }
            });
          }
        }
      } catch (dbError) {
        console.error("Failed to save model response to DB:", dbError);
      }
    };

    // Get io reference before res.end() for async notifications
    const io = req.app.get("io");

    // Generate title for new sessions (async, no await needed for client)
    const generateTitle = async () => {
      try {
        const currentSession = await prisma.chatSession.findUnique({ where: { id: sessionId as number } });
        if (currentSession) {
          const messageCount = await prisma.chatMessage.count({ where: { sessionId: sessionId as number } });
          if (messageCount <= 2 || currentSession.title === 'New Chat') {
            const titlePrompt = `Based on the following conversation, generate a short, concise, and descriptive title (max 6 words). Return ONLY the title text, no quotes or "Title:".\n\nUser: ${prompt}\nInternal Model Response: ${JSON.stringify(data).substring(0, 500)}...`;

            const { result: titleResult } = await executeWithFallback(
              "gemini_chat_model",
              async (m) => await m.generateContent(titlePrompt)
            );

            let newTitle = titleResult.response.text().trim().replace(/^"|"$/g, '').trim();
            if (newTitle) {
              await prisma.chatSession.update({
                where: { id: sessionId as number },
                data: { title: newTitle }
              });

              // Notify frontend that session title was updated
              if (io) {
                io.emit('chat_session_updated', { sessionId, title: newTitle });
              }
            }
          }
        }
      } catch (titleError) {
        console.warn("Failed to generate chat title (stream):", titleError);
      }
    };

    // Fire and forget - don't block
    saveToDb().then(() => generateTitle());

  } catch (error) {
    console.error("Stream error:", error);
    sendEvent('error', { message: (error as Error).message });
    res.end();
  }
};

export const postImage = async (req: Request, res: Response) => {
  try {
    const image: UploadedFile = <any>req.files!.file;

    // If no image submitted, exit
    if (!image) return res.sendStatus(400);

    const prompt = "What is this product? Give me just the name of the product, with no other descriptive text. For example, if it is a can of Campbell's soup, just return 'Campbell's soup'. If you are not sure, just return 'Unknown'";

    const { result, warning } = await executeWithFallback(
      "gemini_vision_model",
      async (model) => await model.generateContent([prompt, fileToGenerativePart(image.tempFilePath, image.mimetype)])
    );

    const response = result.response;
    const productName = response.text();

    // create a new product with associated file
    const product = await prisma.product.create({
      data: {
        title: productName,
        files: {
          create: {
            path: image.name,
            mimeType: image.mimetype
          }
        }
      },
      include: {
        files: true
      }
    });

    // Move the uploaded image to our upload folder
    const fileId = product.files[0].id;

    storeFile(image.tempFilePath, fileId.toString());

    // Append warning to response if exists (though we send the product object, we might wrap it or attach it)
    // The current frontend expects just the product object likely. 
    // We should probably check if we can modify the response structure or just log it.
    // User requirement: "snackbar warning". Frontend needs to see it.
    // Changing res.send(product) to res.json({ product, warning }) might break existing frontend.
    // But since I'm editing frontend too, I can handle it.

    res.json({
      ...product,
      warning
    });

  } catch (error) {
    console.log("response error", error);
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

const cleanJson = (text: string) => {
  // 1. Try to locate the JSON block specifically.
  // We look for the outer-most braces structure that looks like our schema.
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const potentialJson = text.substring(jsonStart, jsonEnd + 1);
    try {
      // Verify it parses
      JSON.parse(potentialJson);
      return potentialJson;
    } catch (e) {
      // If the substring fails, fall back to loose cleaning
    }
  }

  // Remove ```json ... ``` or just ``` ... ```
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
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

    res.json(logs);
  } catch (err) {
    console.error("Error fetching debug logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};
