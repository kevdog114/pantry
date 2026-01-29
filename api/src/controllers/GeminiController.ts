import { GoogleGenerativeAI, Content, FunctionDeclarationSchemaType } from "@google/generative-ai";
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

const DEFAULT_FALLBACK_MODEL = "gemini-flash-latest";

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
    if (setting && setting.value) {
      modelName = setting.value;
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

      // Convert messages to history Content[]
      history = messages.map(msg => {
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
      });
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

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId as number },
      data: { updatedAt: new Date() }
    });

    const contextStart = Date.now();
    const [productContext, familyContext, equipmentContext, weatherContext] = await Promise.all([
      getProductContext(),
      getFamilyContext(),
      getEquipmentContext(),
      getWeatherContext()
    ]);
    const contextDuration = Date.now() - contextStart;
    console.log(`Context generation time: ${contextDuration}ms`);

    const systemInstruction = `
      You are a smart cooking assistant managing a pantry.
      Date: ${new Date().toLocaleDateString()}.
      
      **Core Rules:**
      1. **Response Format:** ALWAYS return a JSON object with a root 'items' array. Items can be type 'chat' (content string) or 'recipe' (structured object).
      2. **Printing:** To print a recipe, first call 'getRecipeDetails', then 'printReceipt' (max 1 call/turn). Confirm with "Sent [title] to printer."
      3. **Stock & Cooking Instructions:** Use provided tools. For package images, use 'createCookingInstruction' for each method (e.g., Microwave, Oven).
      4. **Quantities:** Respect 'trackCountBy' in inventory context. If 'weight', use weight; if 'quantity', use count.

      **JSON Structure:**
      {
        "items": [
          { "type": "chat", "content": "Markdown text..." },
          { "type": "recipe", "recipe": { "title": "...", "ingredients": [{"name":"...", "amount":1, "productId":123}], "instructions": ["..."], "time": { "prep": "...", "cook": "..." } } }
        ]
      }

      **Context:**
      Inventory: ${productContext}
      Family: ${familyContext}
      Equipment: ${equipmentContext}
      Weather: ${weatherContext}
      ${additionalContext ? `User View: ${additionalContext}` : ''}
    `;


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

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: systemInstruction }]
      },
      modelAck, // Artificial Ack to reinforce JSON behavior
      ...history,
      {
        role: "user",
        parts: userParts,
      },
    ];

    const inventoryTools = [
      {
        functionDeclarations: [
          {
            name: "getStockEntries",
            description: "Get a list of stock entries for a specific product. Returns details including ID.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                productId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the product" }
              },
              required: ["productId"]
            }
          },
          {
            name: "createStockEntry",
            description: "Add a new stock entry for a product.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                productId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the product" },
                quantity: { type: FunctionDeclarationSchemaType.NUMBER, description: "Quantity/Amount" },
                unit: { type: FunctionDeclarationSchemaType.STRING, description: "Unit of measure (e.g. 'grams', 'lbs', 'count')" },
                expirationDate: { type: FunctionDeclarationSchemaType.STRING, description: "YYYY-MM-DD" },
                frozen: { type: FunctionDeclarationSchemaType.BOOLEAN },
                opened: { type: FunctionDeclarationSchemaType.BOOLEAN }
              },
              required: ["productId", "quantity"]
            }
          },
          {
            name: "editStockEntry",
            description: "Update an existing stock entry.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                stockId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the stock item" },
                quantity: { type: FunctionDeclarationSchemaType.NUMBER, nullable: true },
                unit: { type: FunctionDeclarationSchemaType.STRING, nullable: true },
                expirationDate: { type: FunctionDeclarationSchemaType.STRING, nullable: true, description: "YYYY-MM-DD or null to clear" },
                frozen: { type: FunctionDeclarationSchemaType.BOOLEAN, nullable: true },
                opened: { type: FunctionDeclarationSchemaType.BOOLEAN, nullable: true }
              },
              required: ["stockId"]
            }
          },
          {
            name: "deleteStockEntry",
            description: "Delete a stock entry.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                stockId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the stock item" }
              },
              required: ["stockId"]
            }
          },
          {
            name: "getShoppingList",
            description: "Get the current shopping list items.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {},
            }
          },
          {
            name: "addToShoppingList",
            description: "Add an item to the shopping list.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                item: { type: FunctionDeclarationSchemaType.STRING, description: "Name of the item" },
                quantity: { type: FunctionDeclarationSchemaType.NUMBER, description: "Quantity" },
                unit: { type: FunctionDeclarationSchemaType.STRING, description: "Unit (e.g. 'pkg', 'oz')" }
              },
              required: ["item"]
            }
          },
          {
            name: "removeFromShoppingList",
            description: "Remove an item from the shopping list by item name.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                item: { type: FunctionDeclarationSchemaType.STRING, description: "Name of the item to remove" }
              },
              required: ["item"]
            }
          },
          {
            name: "getProducts",
            description: "Search for products in inventory by name/keyword. Returns list of matches with IDs.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                query: { type: FunctionDeclarationSchemaType.STRING, description: "Search term" }
              },
              required: ["query"]
            }
          },
          {
            name: "getRecipes",
            description: "Search for recipes by name/keyword. Returns list of matches with IDs.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                query: { type: FunctionDeclarationSchemaType.STRING, description: "Search term" }
              },
              required: ["query"]
            }
          },
          {
            name: "getMealPlan",
            description: "Get the meal plan for a date range.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                startDate: { type: FunctionDeclarationSchemaType.STRING, description: "StartDate (YYYY-MM-DD)" },
                endDate: { type: FunctionDeclarationSchemaType.STRING, description: "EndDate (YYYY-MM-DD)" }
              },
              required: ["startDate", "endDate"]
            }
          },
          {
            name: "addToMealPlan",
            description: "Add a recipe OR a product to the meal plan.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                date: { type: FunctionDeclarationSchemaType.STRING, description: "Date (YYYY-MM-DD)" },
                recipeId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the recipe (optional)" },
                productId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the product (optional)" }
              },
              required: ["date"]
            }
          },
          {
            name: "removeFromMealPlan",
            description: "Remove a meal from the plan using its unique plan ID.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                mealPlanId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the meal plan entry" }
              },
              required: ["mealPlanId"]
            }
          },
          {
            name: "moveMealPlan",
            description: "Move a meal plan entry to a new date.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                mealPlanId: { type: FunctionDeclarationSchemaType.INTEGER },
                newDate: { type: FunctionDeclarationSchemaType.STRING, description: "New Date (YYYY-MM-DD)" }
              },
              required: ["mealPlanId", "newDate"]
            }
          },
          {
            name: "createRecipe",
            description: "Create a new recipe in the recipe book.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                title: { type: FunctionDeclarationSchemaType.STRING, description: "Title of the recipe" },
                description: { type: FunctionDeclarationSchemaType.STRING, description: "Description or summary" },
                ingredients: {
                  type: FunctionDeclarationSchemaType.ARRAY,
                  description: "List of ingredients",
                  items: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                      name: { type: FunctionDeclarationSchemaType.STRING },
                      amount: { type: FunctionDeclarationSchemaType.NUMBER },
                      unit: { type: FunctionDeclarationSchemaType.STRING },
                      productId: { type: FunctionDeclarationSchemaType.INTEGER, description: "Optional: ID of matching product in inventory" }
                    },
                    required: ["name"]
                  }
                },
                steps: {
                  type: FunctionDeclarationSchemaType.ARRAY,
                  description: "List of step-by-step instructions",
                  items: { type: FunctionDeclarationSchemaType.STRING }
                },
                printSteps: {
                  type: FunctionDeclarationSchemaType.ARRAY,
                  description: "Simplified, concise steps optimized for printing on a receipt printer.",
                  items: { type: FunctionDeclarationSchemaType.STRING }
                },
                prepTime: { type: FunctionDeclarationSchemaType.NUMBER, description: "Prep time in minutes" },
                cookTime: { type: FunctionDeclarationSchemaType.NUMBER, description: "Cook time in minutes" },
                yield: { type: FunctionDeclarationSchemaType.STRING, description: "Servings/Yield" }
              },
              required: ["title", "ingredients", "steps"]
            }
          },
          {
            name: "getRecipeDetails",
            description: "Get the full details (ingredients, steps) of a recipe by ID.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                recipeId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the recipe" }
              },
              required: ["recipeId"]
            }
          },
          {
            name: "printReceipt",
            description: "Print a receipt, shopping list, or recipe to the Kiosk thermal printer.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                title: { type: FunctionDeclarationSchemaType.STRING, description: "Title of the receipt" },
                text: { type: FunctionDeclarationSchemaType.STRING, description: "Main body text or description" },
                items: {
                  type: FunctionDeclarationSchemaType.ARRAY,
                  description: "List of items to print (optional)",
                  items: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                      name: { type: FunctionDeclarationSchemaType.STRING },
                      quantity: { type: FunctionDeclarationSchemaType.STRING }
                    },
                    required: ["name"]
                  }
                },
                footer: { type: FunctionDeclarationSchemaType.STRING, description: "Optional footer text" }
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
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                productId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the product these instructions belong to." },
                method: { type: FunctionDeclarationSchemaType.STRING, description: "Cooking method or title (e.g. 'Microwave Instructions')" },
                description: { type: FunctionDeclarationSchemaType.STRING, description: "Brief description of the method." },
                steps: {
                  type: FunctionDeclarationSchemaType.ARRAY,
                  items: { type: FunctionDeclarationSchemaType.STRING },
                  description: "List of instruction steps."
                },
                prepTime: { type: FunctionDeclarationSchemaType.NUMBER },
                cookTime: { type: FunctionDeclarationSchemaType.NUMBER }
              },
              required: ["productId", "method", "steps"]
            }
          },
          {
            name: "sendPushNotification",
            description: "Send a push notification to the user's devices.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                title: { type: FunctionDeclarationSchemaType.STRING, description: "Notification title" },
                body: { type: FunctionDeclarationSchemaType.STRING, description: "Notification body text" }
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
            return { message: "Stock item created", item: newItem };

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
            return { message: "Updated", item: updated };

          case "deleteStockEntry":
            await prisma.stockItem.delete({ where: { id: args.stockId } });
            return { message: "Deleted stock item " + args.stockId };

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
              return { message: "Updated shopping list item quantity", item: updatedItem };
            }

            const newShoppingItem = await prisma.shoppingListItem.create({
              data: {
                shoppingListId: shoppingList.id,
                name: args.item,
                quantity: args.quantity || 1,
                unit: args.unit || null
              }
            });
            return { message: "Added to shopping list", item: newShoppingItem };

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
              return { message: `Removed ${itemToDelete.name} from shopping list.` };
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
            return { message: "Added meal plan", planId: newPlan.id };

          case "removeFromMealPlan":
            await prisma.mealPlan.delete({ where: { id: args.mealPlanId } });
            return { message: "Removed meal from plan" };

          case "moveMealPlan":
            await prisma.mealPlan.update({
              where: { id: args.mealPlanId },
              data: { date: new Date(args.newDate) }
            });
            return { message: "Moved meal plan" };

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

            return { message: "Recipe created successfully. ID: " + newRecipe.id, recipeId: newRecipe.id };

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

              return { message: "Print command sent to Kiosk." };
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
            return { message: "Timer started", timer: newTimer };

          case "deleteTimer":
            await prisma.timer.delete({ where: { id: args.timerId } });
            return { message: "Timer deleted" };

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
            return { message: "Created cooking instruction", type: "instruction", instructionId: newInstruction.id };

          case "sendPushNotification":
            const uId = (req.user as any)?.id;
            if (!uId) return { error: "User context not found." };
            await sendNotificationToUser(uId, args.title, args.body);
            return { message: `Notification sent.` };

          default:
            return { error: "Unknown tool" };
        }
      } catch (e: any) {
        return { error: e.message };
      }
    }

    const debugSetting = await prisma.systemSetting.findUnique({ where: { key: 'gemini_debug' } });
    const isGeminiDebug = debugSetting?.value === 'true';

    const { result, warning } = await executeWithFallback(
      "gemini_chat_model",
      async (model) => {
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
        let responseResult = await model.generateContent({
          contents: currentContents,
          tools: inventoryTools,
          // We remove explicit JSON enforcement here to allow tool calls to happen naturally
          // The system prompt still demands JSON for the final answer.
        });

        while (currentLoop < maxLoops) {
          const response = responseResult.response;
          const calls = response.functionCalls ? response.functionCalls() : [];

          if (calls && calls.length > 0) {
            // 1. Add model's tool call message to history
            // Note: In some SDK versions, we need to construct the part carefully
            currentContents.push({
              role: "model",
              parts: response.parts,
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
            responseResult = await model.generateContent({
              contents: currentContents,
              tools: inventoryTools
            });

            currentLoop++;
          } else {
            // No more calls, this is the final response
            break;
          }
        }
        return responseResult;
      }
    );

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

    res.json({
      message: "success",
      data: data,
      sessionId, // Return sessionId so client can update URL/state
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



function fileToGenerativePart(path: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

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
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        freezerLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        refrigeratorLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        openedLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        pantryLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        trackCountBy: { type: FunctionDeclarationSchemaType.STRING, enum: ["quantity", "weight"] }
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
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        suggestions: {
          type: FunctionDeclarationSchemaType.ARRAY,
          items: {
            type: FunctionDeclarationSchemaType.OBJECT,
            properties: {
              name: { type: FunctionDeclarationSchemaType.STRING },
              prepTime: { type: FunctionDeclarationSchemaType.STRING },
              description: { type: FunctionDeclarationSchemaType.STRING },
              ingredients: { type: FunctionDeclarationSchemaType.ARRAY, items: { type: FunctionDeclarationSchemaType.STRING } }
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
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        items: {
          type: FunctionDeclarationSchemaType.ARRAY,
          items: {
            type: FunctionDeclarationSchemaType.OBJECT,
            properties: {
              name: { type: FunctionDeclarationSchemaType.STRING },
              hoursToThaw: { type: FunctionDeclarationSchemaType.NUMBER },
              advice: { type: FunctionDeclarationSchemaType.STRING }
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
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        matchId: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true }
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
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        title: { type: FunctionDeclarationSchemaType.STRING },
        brand: { type: FunctionDeclarationSchemaType.STRING },
        description: { type: FunctionDeclarationSchemaType.STRING },
        tags: { type: FunctionDeclarationSchemaType.ARRAY, items: { type: FunctionDeclarationSchemaType.STRING } },
        pantryLifespanDays: { type: FunctionDeclarationSchemaType.NUMBER, nullable: true },
        refrigeratorLifespanDays: { type: FunctionDeclarationSchemaType.NUMBER, nullable: true },
        freezerLifespanDays: { type: FunctionDeclarationSchemaType.NUMBER, nullable: true },
        openedLifespanDays: { type: FunctionDeclarationSchemaType.NUMBER, nullable: true },
        trackCountBy: { type: FunctionDeclarationSchemaType.STRING, enum: ["quantity", "weight"] },
        autoPrintLabel: { type: FunctionDeclarationSchemaType.BOOLEAN }
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
