/**
 * Gemini AI provider implementation using @google/genai SDK.
 */
import {
  AIClient,
  AIContent,
  AIPart,
  GenerateContentConfig,
  GenerateContentResult,
  GenerateContentStreamResult,
  StreamChunk,
  ToolDefinition,
} from "../AIClient";

// Lazy-loaded SDK (ESM-only module)
let _ai: any = null;

async function getAI(): Promise<any> {
  if (!_ai) {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY or AI_API_KEY is required for Gemini provider");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

/**
 * Convert our unified ToolDefinition[] to Gemini's functionDeclarations format.
 * Gemini expects uppercase type values and functionDeclarations wrapper.
 */
function toGeminiTools(tools: ToolDefinition[] | undefined): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => {
    const schema = JSON.parse(JSON.stringify(tool.parameters));
    normalizeSchemaTypes(schema); // uppercase for Gemini

    return {
      functionDeclarations: [
        {
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: schema,
        }
      ]
    };
  });
}

/**
 * Recursively convert type values to uppercase (Gemini format).
 */
function normalizeSchemaTypes(schema: any) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type && typeof schema.type === "string") {
    schema.type = schema.type.toUpperCase();
  }

  if (schema.properties) {
    Object.values(schema.properties).forEach((v: any) => normalizeSchemaTypes(v));
  }
  if (schema.items) {
    normalizeSchemaTypes(schema.items);
  }
}

/**
 * Extract text from a Gemini response.
 */
function extractText(response: any): string {
  return response.text || response.candidates?.[0]?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join("") || "";
}

/**
 * Extract function calls from a Gemini response.
 */
function extractFunctionCalls(response: any): { name: string; args: Record<string, any> }[] {
  const parts = response.candidates?.[0]?.content?.parts || [];
  return parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
}

/**
 * Extract raw parts from a Gemini response.
 */
function extractRawParts(response: any): AIPart[] {
  const parts = response.candidates?.[0]?.content?.parts || [];
  return parts.map((p: any) => {
    const part: AIPart = {};
    if (p.text !== undefined) part.text = p.text;
    if (p.functionCall) part.functionCall = p.functionCall;
    if (p.functionResponse) part.functionResponse = p.functionResponse;
    if (p.inlineData) part.inlineData = p.inlineData;
    if (p.thoughtSignature) part.thoughtSignature = p.thoughtSignature;
    return part;
  });
}

export class GeminiProvider implements AIClient {
  public getProviderId(): string {
    return "gemini";
  }

  public async generateContent(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentResult> {
    const ai = await getAI();

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: config?.systemInstruction,
        tools: toGeminiTools(config?.tools),
        temperature: config?.temperature,
        topP: config?.topP,
        topK: config?.topK,
        maxOutputTokens: config?.maxOutputTokens,
        responseMimeType: config?.responseMimeType,
        responseSchema: config?.responseSchema,
      }
    });

    return {
      text: extractText(response),
      functionCalls: extractFunctionCalls(response),
      rawParts: extractRawParts(response),
      usageMetadata: response.usageMetadata,
      candidates: response.candidates,
    };
  }

  public async generateContentStream(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentStreamResult> {
    const ai = await getAI();

    const streamResult = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: config?.systemInstruction,
        tools: toGeminiTools(config?.tools),
        temperature: config?.temperature,
        topP: config?.topP,
        topK: config?.topK,
        maxOutputTokens: config?.maxOutputTokens,
        responseMimeType: config?.responseMimeType,
        responseSchema: config?.responseSchema,
      }
    });

    // Wrap the Gemini stream in our unified interface
    return {
      async *[Symbol.asyncIterator]() {
        const iterable = streamResult.stream ? streamResult.stream : streamResult;
        for await (const chunk of iterable) {
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("") || (chunk.text || "");
          const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall) || (chunk.functionCalls || []);

          yield {
            text,
            functionCalls,
            rawParts: parts.map((p: any) => {
              const part: AIPart = {};
              if (p.text !== undefined) part.text = p.text;
              if (p.functionCall) part.functionCall = p.functionCall;
              if (p.thoughtSignature) part.thoughtSignature = p.thoughtSignature;
              return part;
            }),
          };
        }
      },
    };
  }

  public async analyzeImage(
    model: string,
    prompt: string,
    imageData: { data: string; mimeType: string },
    config?: GenerateContentConfig
  ): Promise<GenerateContentResult> {
    return this.generateContent(model, [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: imageData },
        ],
      },
    ], config);
  }
}
