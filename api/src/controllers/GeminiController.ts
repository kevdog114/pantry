import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { db } from "../../models";
import { UploadedFile } from "express-fileupload";
import * as fs from "fs";

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

const geminiVisionModel = googleAI.getGenerativeModel({
    model: "gemini-pro-vision",
    ...geminiConfig,
})

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
      context += `Product: ${product.title}\n`;
      for (const stockItem of stockItems) {
        context += `  - Quantity: ${stockItem.quantity}\n`;
        context += `  - Expiration Date: ${stockItem.expiration}\n`;
      }
    }
  }
  return context;
};

export const post = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    const productContext = await getProductContext();
    const fullPrompt = `${productContext}\n${prompt}`;

    const result = await geminiModel.generateContent(fullPrompt);
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

const uploadDir = __dirname + "/../../../data/upload/";

function fileToGenerativePart(path: string, mimeType:string) {
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

        // create a new product
        const product = await db.Products.create({
            title: productName
        });

        // create a new record in the database
        var entity = await db.Files.create({
            filename: image.name
        });

        // Move the uploaded image to our upload folder
        fs.renameSync(image.tempFilePath, uploadDir + entity.dataValues.id);

        // associate the file with the product
        await db.ProductFiles.create({
            ProductId: product.dataValues.id,
            FileId: entity.dataValues.id
        });

        res.send(product);

    } catch (error) {
        console.log("response error", error);
        res.status(500).json({
          message: "error",
          data: (error as Error).message,
        });
    }
}
