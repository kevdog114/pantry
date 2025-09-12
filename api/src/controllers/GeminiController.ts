import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { Request, Response } from "express";

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
  model: "gemini-2.5-flash",
  ...geminiConfig,
});

export const post = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    res.json({
      message: 'success',
      data: response.text()
    });
  } catch (error) {
    console.log("response error", error);
    res.status(500).json({
      message: 'error',
      data: (error as Error).message
    });
  }
};
