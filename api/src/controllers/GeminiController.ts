import { GoogleGenerativeAI, Content, FunctionDeclarationSchemaType } from "@google/generative-ai";
import dotenv from "dotenv";
import { Request, Response } from "express";
import prisma from '../lib/prisma';
import { UploadedFile } from "express-fileupload";
import * as fs from "fs";
import { storeFile } from "../lib/FileStorage";

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
async function getGeminiModel(featureKey: string, fallbackModelName: string = DEFAULT_FALLBACK_MODEL) {
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
async function executeWithFallback<T>(
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

  let context = "Here is a list of products I have:\n";
  for (const product of products) {
    if (product.stockItems.length > 0) {
      context += `Product: ${product.title}\n`;
      for (const stockItem of product.stockItems) {
        context += `  - Quantity: ${stockItem.quantity}\n`;
        context += `  - Expiration Date: ${stockItem.expirationDate}\n`;
      }
    }
  }
  return context;
};

const getFamilyContext = async (): Promise<string> => {
  const members = await prisma.familyMember.findMany();
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

export const post = async (req: Request, res: Response) => {
  try {
    let { prompt, history = [], sessionId } = req.body as {
      prompt: string;
      history: Content[];
      sessionId?: number;
    };

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
        where: { sessionId },
        orderBy: { createdAt: 'asc' }
      });

      // Convert messages to history Content[]
      // Note: We need to ensure we map 'user' and 'model' correctly.
      // In DB, sender is 'user' or 'model'.
      history = messages.map(msg => {
        let text = msg.content || '';
        // If it was a recipe, we construct a JSON representation to simulate what the model outputted
        if (msg.type === 'recipe' && msg.recipeData) {
          // We wrap it in the structure the model uses
          text = JSON.stringify({
            items: [{
              type: 'recipe',
              recipe: JSON.parse(msg.recipeData)
            }]
          });
        }
        return {
          role: msg.sender,
          parts: [{ text }]
        } as Content;
      });
    }

    // Save User Message to DB
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionId!,
        sender: 'user',
        type: 'chat',
        content: prompt
      }
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    const productContext = await getProductContext();
    const systemInstruction = `
      You are a helpful cooking assistant. You have access to the user's pantry inventory.
      
      When the user asks for a recipe, or just wants to chat, you MUST return a JSON object with the following structure:
      {
        "items": [
          {
            "type": "recipe",
            "recipe": {
              "title": "Recipe Title",
              "description": "Brief description",
              "ingredients": ["Ingredient 1", "Ingredient 2"],
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
    `;


    const modelAck = {
      role: "model",
      parts: [
        {
          text: "Understood. I will always return valid JSON with a root 'items' array containing objects with 'type': 'recipe' or 'type': 'chat'.",
        },
      ],
    };

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: systemInstruction }]
      },
      modelAck, // Artificial Ack to reinforce JSON behavior
      ...history,
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    const { result, warning } = await executeWithFallback(
      "gemini_chat_model",
      async (model) => await model.generateContent({
        contents,
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    );

    const response = result.response;
    let data;
    try {
      data = JSON.parse(response.text());
    } catch (e) {
      // Fallback if model fails to return JSON
      data = {
        items: [
          {
            type: 'chat',
            content: response.text()
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
              sessionId: sessionId!,
              sender: 'model',
              type: 'recipe',
              recipeData: JSON.stringify(item.recipe)
            }
          });
        } else {
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionId!,
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
            sessionId: sessionId!,
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
            sessionId: sessionId!,
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
      const currentSession = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      // Update if it was just created (we assume prompt based title is temporary if we want gemini to do it)
      // or if it is "New Chat"
      if (currentSession) {
        const messageCount = await prisma.chatMessage.count({ where: { sessionId } });
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
              where: { id: sessionId },
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

export const postExpiration = async (req: Request, res: Response) => {
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

      Return the result as a JSON object with keys: freezerLifespanDays, refrigeratorLifespanDays, openedLifespanDays. Use integer values. If unknown or if you are not sure, return null for that field.`;

    const schema = {
      type: FunctionDeclarationSchemaType.OBJECT,
      properties: {
        freezerLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        refrigeratorLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
        openedLifespanDays: { type: FunctionDeclarationSchemaType.INTEGER, nullable: true },
      },
      required: [
        "freezerLifespanDays",
        "refrigeratorLifespanDays",
        "openedLifespanDays",
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
    const { tags } = req.body as { tags: string[] };

    if (!tags || !Array.isArray(tags)) {
      res.status(400).json({ message: "Tags are required and must be an array" });
      return;
    }

    const productContext = await getProductContext();

    const prompt = `You are a kitchen assistant. Suggest 3 distinct snacks based on these tags: ${tags.join(', ')}. 
    Only suggest items that require ingredients currently in the user's inventory.
    
    Here is the inventory:
    ${productContext}

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
