import { GoogleGenerativeAI, Content, FunctionDeclarationSchemaType } from "@google/generative-ai";
import dotenv from "dotenv";
import { Request, Response } from "express";
import prisma from '../lib/prisma';
import { UploadedFile } from "express-fileupload";
import * as fs from "fs";
import * as path from "path";
import { storeFile, UPLOAD_DIR } from "../lib/FileStorage";

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
      stockItems: true
    }
  });

  const contextParts: string[] = ["Here is a list of ALL products available in the system, along with their current stock levels:"];
  for (const product of products) {
    const totalQuantity = product.stockItems.reduce((sum, item) => sum + item.quantity, 0);

    if (product.stockItems.length > 0) {
      contextParts.push(`Product: ${product.title} (ID: ${product.id}) - Total Quantity: ${totalQuantity}`);
      for (const stockItem of product.stockItems) {
        contextParts.push(`  - Stock ID: ${stockItem.id}`);
        contextParts.push(`    Quantity: ${stockItem.quantity}`);
        contextParts.push(`    Expiration Date: ${stockItem.expirationDate ? stockItem.expirationDate.toISOString().split('T')[0] : 'N/A'}`);
        contextParts.push(`    Status: ${stockItem.frozen ? 'Frozen' : 'Fresh'}, ${stockItem.opened ? 'Opened' : 'Unopened'}`);
      }
    } else {
      // List products with no stock so we can add to them
      contextParts.push(`Product: ${product.title} (ID: ${product.id}) - Total Quantity: 0`);
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

export const post = async (req: Request, res: Response) => {
  try {
    let { prompt, history = [], sessionId, additionalContext } = req.body as {
      prompt: string;
      history: Content[];
      sessionId?: number | string;
      additionalContext?: string;
    };

    if (sessionId) {
      sessionId = parseInt(sessionId as string, 10);
    }

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

    const productContext = await getProductContext();
    const systemInstruction = `
      You are a helpful cooking assistant. You have access to the user's pantry inventory.
      The current date is ${new Date().toLocaleDateString()}.
      You can use the provided tools to managing stock entries (create, edit, delete, list).
      
      When the user asks for a recipe, or just wants to chat, you MUST return a JSON object with the following structure:
      {
        "items": [
          {
            "type": "recipe",
            "recipe": {
              "title": "Recipe Title",
              "description": "Brief description",
              "ingredients": [
                { 
                  "name": "Ingredient Name", 
                  "amount": 1.5, 
                  "unit": "cup",
                  "productId": 123 // Optional: Only if this matches a product in the list below (use ID from context). Null if no match.
                }
              ],
              "instructions": ["Step 1", "Step 2"],
              "time": {
                "prep": "10 mins",
                "cook": "20 mins",
                "total": "30 mins"
              }
            }
          },
          {
             "type": "chat",
             "content": "Your response here. You can use **Markdown** for formatting."
          }
        ]
      }
      
      You can return multiple items in the list. For example, a chat message followed by a recipe, or just a single chat message.

      Here is the current inventory:
      ${productContext}

      Here are the family preferences and details. Please consider these when suggesting recipes or answering food questions:
      ${await getFamilyContext()}

      Here is the available cooking equipment:
      ${await getEquipmentContext()}


      ${additionalContext ? `\nCONTEXT FROM USER'S CURRENT VIEW:\n${additionalContext}\n` : ''}
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
                quantity: { type: FunctionDeclarationSchemaType.NUMBER, description: "Quantity" }
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
            description: "Add a recipe to the meal plan.",
            parameters: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                date: { type: FunctionDeclarationSchemaType.STRING, description: "Date (YYYY-MM-DD)" },
                recipeId: { type: FunctionDeclarationSchemaType.INTEGER, description: "ID of the recipe" }
              },
              required: ["date", "recipeId"]
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
                  description: "List of instruction steps",
                  items: { type: FunctionDeclarationSchemaType.STRING }
                },
                prepTime: { type: FunctionDeclarationSchemaType.NUMBER, description: "Prep time in minutes" },
                cookTime: { type: FunctionDeclarationSchemaType.NUMBER, description: "Cook time in minutes" },
                yield: { type: FunctionDeclarationSchemaType.STRING, description: "Servings/Yield" }
              },
              required: ["title", "steps", "ingredients"]
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
                data: { quantity: args.quantity || 1 }
              });
              return { message: "Updated shopping list item quantity", item: updatedItem };
            }

            const newShoppingItem = await prisma.shoppingListItem.create({
              data: {
                shoppingListId: shoppingList.id,
                name: args.item,
                quantity: args.quantity || 1
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
            const newPlan = await prisma.mealPlan.create({
              data: {
                date: new Date(dateStr),
                recipeId: args.recipeId
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
            return { message: "Recipe created successfully. ID: " + newRecipe.id, recipeId: newRecipe.id };

          default:
            return { error: "Unknown tool" };
        }
      } catch (e: any) {
        return { error: e.message };
      }
    }

    const { result, warning } = await executeWithFallback(
      "gemini_chat_model",
      async (model) => {
        let currentContents = [...contents];
        let currentLoop = 0;
        const maxLoops = 5;

        // Initial generation
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
    const { productTitle } = req.body as { productTitle: string };

    if (!productTitle) {
      res.status(400).json({ message: "Product title is required" });
      return;
    }

    const prompt = `For the product '${productTitle}', estimate the recommended lifespan in days for the following conditions:
      1. Freezer lifespan: How many days it is good in the freezer.
      2. Refrigerator lifespan: How many days it is good in the refrigerator (after thawing if frozen).
      3. Opened lifespan: How many days it is good after being opened.
      
      Also, recommend the best way to track the remaining amount of this product: 'quantity' (e.g., cans, boxes) or 'weight' (e.g., flour, sugar, pasta).

      Return the result as a JSON object with keys: 
      - freezerLifespanDays
      - refrigeratorLifespanDays
      - openedLifespanDays
      - trackCountBy ('quantity' or 'weight')
      
      Use integer values for days. If unknown or if you are not sure for days, return null for that field. default trackCountBy to 'quantity' if unsure.`;

    const schema = {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        freezerLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        refrigeratorLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        openedLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
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

    const prompt = `I am adding a barcode for "${productName}"${brand ? ` (${brand})` : ''} to an existing product "${existingProductTitle}".
        Suggest a short description for this specific barcode variant (e.g. "15oz Can", "Family Size", "Spicy variety") and a list of tags that apply to this product.
        
        Return the result as a JSON object with keys:
        - description (string)
        - tags (array of strings)
        `;

    const schema = {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        description: { type: FunctionDeclarationSchemaType.STRING },
        tags: { type: FunctionDeclarationSchemaType.ARRAY, items: { type: FunctionDeclarationSchemaType.STRING } }
      },
      required: ["description", "tags"]
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
