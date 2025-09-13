import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { db } from "../../models";

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
  model: "gemini-1.5-flash",
  ...geminiConfig,
});

const getProductContext = async (): Promise<string> => {
  const products = await db.Products.findAll({
    include: [
      {
        model: db.StockItems,
      },
    ],
  });

  let context = "Here is a list of products I have:\n";
  for (const product of products) {
    const stockItems = product.StockItems;
    if (stockItems && stockItems.length > 0) {
      context += `Product: ${product.dataValues.title}\n`;
      for (const stockItem of stockItems) {
        context += `  - Quantity: ${stockItem.dataValues.quantity}\n`;
        context += `  - Expiration Date: ${stockItem.dataValues.expiration}\n`;
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
