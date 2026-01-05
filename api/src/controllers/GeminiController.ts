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
const geminiConfig = {
  temperature: 0.9,
  topP: 1,
  topK: 1,
  maxOutputTokens: 4096,
};

const geminiModel = googleAI.getGenerativeModel({
  model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
  ...geminiConfig,
});

const geminiVisionModel = googleAI.getGenerativeModel({
  model: process.env.GEMINI_VISION_MODEL || "gemini-pro-vision",
  ...geminiConfig,
})

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
    const systemMessage = {
      role: "user",
      parts: [
        {
          text: `Here is the current inventory of my pantry. Please use this as context for my questions:\n${productContext}`,
        },
      ],
    };
    const modelAck = {
      role: "model",
      parts: [
        {
          text: "Okay, I have the pantry inventory. What would you like to know or do?",
        },
      ],
    };

    const contents: Content[] = [
      systemMessage,
      modelAck,
      ...history,
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    const result = await geminiModel.generateContent({ contents });
    const response = result.response;
    res.json({
      message: "success",
      data: response.text(),
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

    const result = await geminiVisionModel.generateContent([prompt, fileToGenerativePart(image.tempFilePath, image.mimetype)]);
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

    res.send(product);

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

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const response = result.response;
    const jsonString = response.text();
    const data = JSON.parse(jsonString);

    res.json({
      message: "success",
      data: data,
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: "error",
      data: (error as Error).message,
    });
  }
};
