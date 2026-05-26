/**
 * OpenAI-compatible AI provider implementation.
 * Works with OpenAI API, Ollama, LiteLLM, and any OpenAI-compatible endpoint.
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

// Lazy-loaded SDK
let _openai: any = null;
let _cachedBaseUrl: string = "";
let _cachedApiKey: string = "";

async function getOpenAI(baseUrl: string, apiKey: string): Promise<any> {
  if (!_openai || _cachedBaseUrl !== baseUrl || _cachedApiKey !== apiKey) {
    const { OpenAI } = await import("openai");
    _openai = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey || "not-needed",
    });
    _cachedBaseUrl = baseUrl;
    _cachedApiKey = apiKey;
  }
  return _openai;
}

/**
 * Convert our unified ToolDefinition[] to OpenAI's function tools format.
 * OpenAI expects lowercase type values (JSON Schema standard).
 */
function toOpenAITools(tools: ToolDefinition[] | undefined): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => {
    const schema = JSON.parse(JSON.stringify(tool.parameters));
    normalizeSchemaTypes(schema); // lowercase for OpenAI

    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: schema,
      },
    };
  });
}

/**
 * Recursively convert type values to lowercase (JSON Schema standard for OpenAI).
 */
function normalizeSchemaTypes(schema: any) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type && typeof schema.type === "string") {
    schema.type = schema.type.toLowerCase();
  }

  if (schema.properties) {
    Object.values(schema.properties).forEach((v: any) => normalizeSchemaTypes(v));
  }
  if (schema.items) {
    normalizeSchemaTypes(schema.items);
  }
}

/**
 * Convert AIContent[] (Gemini format) to OpenAI messages format.
 */
function toOpenAIMessages(contents: AIContent[]): any[] {
  const messages: any[] = [];
  // Track tool call IDs for matching responses
  let nextToolCallIdx = 0;

  for (const content of contents) {
    if (content.role === "system") {
      const text = content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
      if (text) {
        messages.push({ role: "system", content: text });
      }
      continue;
    }

    if (content.role === "model") {
      const fcParts = content.parts.filter((p: any) => p.functionCall);
      if (fcParts.length > 0) {
        const toolCalls = fcParts.map((p: any, i: number) => {
          const id = p.functionCall.id || `call_${nextToolCallIdx++}`;
          return {
            id,
            type: "function",
            index: i,
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args),
            },
          };
        });

        const textParts = content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
        messages.push({
          role: "assistant",
          content: textParts || null,
          tool_calls: toolCalls,
        });
      } else {
        const text = content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
        if (text) {
          messages.push({ role: "assistant", content: text });
        }
      }
      continue;
    }

    // User role
    const fcResponses = content.parts.filter((p: any) => p.functionResponse);
    if (fcResponses.length > 0) {
      for (const part of fcResponses) {
        messages.push({
          role: "tool",
          tool_call_id: part.functionResponse.id || `call_${nextToolCallIdx - fcResponses.length + fcResponses.indexOf(part)}`,
          name: part.functionResponse.name,
          content: JSON.stringify(part.functionResponse.response),
        });
      }
    } else {
      const textParts = content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
      const imageParts = content.parts.filter((p: any) => p.inlineData);

      if (imageParts.length > 0) {
        const imagePart = imageParts[0];
        messages.push({
          role: "user",
          content: [
            { type: "text", text: textParts },
            {
              type: "image_url",
              image_url: {
                url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
              },
            },
          ],
        });
      } else if (textParts) {
        messages.push({ role: "user", content: textParts });
      }
    }
  }

  return messages;
}

/**
 * Split system instruction from contents, returning { systemInstruction, contents }.
 * The systemInstruction is passed separately in OpenAI config.
 */
function extractSystemInstruction(contents: AIContent[]): AIContent[] {
  return contents.filter(c => c.role !== "system");
}

export class OpenAIProvider implements AIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  public getProviderId(): string {
    return "openai";
  }

  public async generateContent(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentResult> {
    const openai = await getOpenAI(this.baseUrl, this.apiKey);

    // Extract system instruction from config or contents
    const systemInstruction = config?.systemInstruction;
    const filteredContents = extractSystemInstruction(contents);
    const messages = toOpenAIMessages(filteredContents);

    const response = await openai.chat.completions.create({
      model,
      messages: systemInstruction
        ? [{ role: "system", content: systemInstruction }, ...messages]
        : messages,
      tools: toOpenAITools(config?.tools),
      temperature: config?.temperature,
      top_p: config?.topP,
      max_tokens: config?.maxOutputTokens,
    });

    const choice = response.choices[0];
    const message = choice.message;

    const functionCalls = message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments),
    })) || [];

    const rawParts: AIPart[] = [];
    if (message.content) {
      rawParts.push({ text: message.content });
    }
    for (const fc of functionCalls) {
      rawParts.push({ functionCall: fc });
    }

    return {
      text: message.content || "",
      functionCalls,
      rawParts,
      usageMetadata: response.usage,
    };
  }

  public async generateContentStream(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentStreamResult> {
    const openai = await getOpenAI(this.baseUrl, this.apiKey);

    const systemInstruction = config?.systemInstruction;
    const filteredContents = extractSystemInstruction(contents);
    const messages = toOpenAIMessages(filteredContents);

    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      messages: systemInstruction
        ? [{ role: "system", content: systemInstruction }, ...messages]
        : messages,
      tools: toOpenAITools(config?.tools),
      temperature: config?.temperature,
      top_p: config?.topP,
      max_tokens: config?.maxOutputTokens,
    });

    return {
      async *[Symbol.asyncIterator]() {
        // Accumulate function call args across chunks (OpenAI streams them incrementally)
        const fcAccumulators: { id: string; name: string; args: string }[] = [];

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          const delta = choice.delta;
          const text = delta.content || "";

          // Accumulate function call arguments
          if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!fcAccumulators[idx]) {
                fcAccumulators[idx] = { id: tc.id || `call_${idx}`, name: "", args: "" };
              }
              if (tc.id) {
                fcAccumulators[idx].id = tc.id;
              }
              if (tc.function?.name) {
                fcAccumulators[idx].name = tc.function.name;
              }
              if (tc.function?.arguments) {
                fcAccumulators[idx].args += tc.function.arguments;
              }
            }
          }

          // Yield text chunks
          if (text) {
            yield {
              text,
              functionCalls: [],
              rawParts: [{ text }],
            };
          }
        }

        // After stream ends, yield complete function calls
        if (fcAccumulators.length > 0) {
          const functionCalls = fcAccumulators.map(acc => ({
            id: acc.id,
            name: acc.name,
            args: acc.args ? JSON.parse(acc.args) : {},
          }));

          yield {
            text: "",
            functionCalls,
            rawParts: functionCalls.map(fc => ({ functionCall: fc })),
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
    const openai = await getOpenAI(this.baseUrl, this.apiKey);

    const messages: any[] = [];
    if (config?.systemInstruction) {
      messages.push({ role: "system", content: config.systemInstruction });
    }

    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${imageData.mimeType};base64,${imageData.data}`,
          },
        },
      ],
    });

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: config?.temperature,
      top_p: config?.topP,
      max_tokens: config?.maxOutputTokens,
    });

    const choice = response.choices[0];
    const message = choice.message;

    return {
      text: message.content || "",
      functionCalls: [],
      rawParts: [{ text: message.content || "" }],
      usageMetadata: response.usage,
    };
  }
}
