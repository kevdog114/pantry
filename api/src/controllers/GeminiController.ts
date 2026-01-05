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

export const post = async (req: Request, res: Response) => {
  try {
    const { prompt, history = [] } = req.body as {
      prompt: string;
      history: Content[];
    };

    const productContext = await getProductContext();
    const systemInstruction = `
      You are a helpful cooking assistant. You have access to the user's pantry inventory.
      
      When the user asks for a recipe, you MUST return a JSON object with the following structure:
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
      }

      For all other interactions (questions, chatting, etc.), return a JSON object with this structure:
      {
        "type": "chat",
        "content": "Your response here. You can use **Markdown** for formatting."
      }

      Here is the current inventory:
      ${productContext}
    `;

    const modelAck = {
      role: "model",
      parts: [
        {
          text: "Understood. I will always return valid JSON with either 'type': 'recipe' or 'type': 'chat'.",
        },
      ],
    };

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: systemInstruction }]
      },
      modelAck,
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
      // Fallback if model fails to return JSON (unlikely with restriction but possible)
      data = {
        type: 'chat',
        content: response.text()
      };
    }

    res.json({
      message: "success",
      data: data,
      warning // Send warning to frontend
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
