import { Request, Response } from "express";
import { executeToolHandler } from "../gemini/toolHandlers";
import { getAllToolDefinitions } from "../gemini/toolDefinitions";
import { getAIClient, normalizeToolDefinitions } from "./ai";
import * as crypto from "crypto";

const ai = getAIClient();

/**
 * Get the model name for OpenAI-compatible endpoint.
 */
async function getFeatureModel(featureKey: string, fallback: string = "gemini-flash-latest"): Promise<string> {
  try {
    const { default: prisma } = await import('../lib/prisma');
    const setting = await prisma.systemSetting.findUnique({
      where: { key: featureKey }
    });
    if (setting?.value) {
      const val = setting.value.trim();
      if (val !== 'auto') return val;
    }
  } catch (err) {
    // ignore
  }

  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase().trim();
  return provider === "openai"
    ? (process.env.AI_DEFAULT_MODEL || fallback)
    : fallback;
}

// Transform OpenAI message history to our unified AIContent format
function mapMessagesToContents(messages: any[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            continue; // system instructions are handled separately
        }

        let role = msg.role === 'user' ? 'user' : 'model';
        let parts: any[] = [];

        if (msg.role === 'assistant' && msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                parts.push({
                    functionCall: {
                        name: tc.function.name,
                        args: JSON.parse(tc.function.arguments)
                    }
                });
            }
        } else if (msg.role === 'tool') {
            role = 'user';
            parts.push({
                functionResponse: {
                    name: msg.name,
                    response: JSON.parse(msg.content)
                }
            });
        } else {
            parts.push({ text: msg.content });
        }

        contents.push({ role, parts });
    }

    return contents;
}

// Get unified tool definitions
function getTools() {
    return normalizeToolDefinitions(getAllToolDefinitions());
}

export const getModels = async (req: Request, res: Response) => {
    const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase().trim();

    // Return standard OpenAI model format
    res.json({
        object: "list",
        data: provider === "openai"
            ? [
                {
                    id: process.env.AI_DEFAULT_MODEL || "google/gemma-4-26b-a4b",
                    object: "model",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: "local"
                }
              ]
            : [
                {
                    id: "gemini-flash-latest",
                    object: "model",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: "google"
                },
                {
                    id: "gemini-3-pro-preview",
                    object: "model",
                    created: Math.floor(Date.now() / 1000),
                    owned_by: "google"
                }
              ]
    });
};

export const chatCompletions = async (req: Request, res: Response) => {
    try {
        const { model: modelId, messages, stream, temperature, top_p, max_tokens } = req.body;
        const user = req.user as any;
        const sessionId = req.body.session_id || 1;

        // Find system message
        const systemMessage = messages.find((m: any) => m.role === 'system');
        const systemInstruction = systemMessage ? systemMessage.content : `You are a smart cooking assistant managing a pantry. Date: ${new Date().toLocaleDateString()}.`;

        const contents = mapMessagesToContents(messages);

        // Setup config
        const config: any = {
            systemInstruction,
            temperature: temperature ?? 0.7,
            tools: getTools(),
        };
        if (top_p) config.topP = top_p;
        if (max_tokens) config.maxOutputTokens = max_tokens;

        const featureKey = "gemini_router_model";
        const fallbackModelName = modelId || (process.env.AI_DEFAULT_MODEL || "gemini-flash-latest");
        const modelName = await getFeatureModel(featureKey, fallbackModelName);

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const reqId = crypto.randomUUID();
            let currentContents = [...contents];
            let keepGenerating = true;

            while (keepGenerating) {
                keepGenerating = false;

                try {
                    const resultStream = await ai.generateContentStream(modelName, currentContents, config);

                    let functionCallsQueue: any[] = [];
                    let fullText = "";

                    for await (const chunk of resultStream) {
                        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                            functionCallsQueue.push(...chunk.functionCalls);
                        } else {
                            const textPart = chunk.text;
                            if (textPart) {
                                fullText += textPart;

                                const payload = {
                                    id: `chatcmpl-${reqId}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: fallbackModelName,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {
                                                content: textPart
                                            },
                                            finish_reason: null
                                        }
                                    ]
                                };
                                res.write(`data: ${JSON.stringify(payload)}\n\n`);
                            }
                        }
                    }

                    if (functionCallsQueue.length > 0) {
                        currentContents.push({
                            role: "model",
                            parts: functionCallsQueue.map(fc => ({ functionCall: fc }))
                        });

                        const toolResponses = [];
                        for (const fc of functionCallsQueue) {
                            const result = await executeToolHandler(fc.name, fc.args, {
                                userId: user?.id,
                                sessionId: sessionId,
                                io: (req as any).app.get('io')
                            });
                            toolResponses.push({
                                functionResponse: {
                                    name: fc.name,
                                    response: { result }
                                }
                            });
                        }

                        currentContents.push({
                            role: "user",
                            parts: toolResponses
                        });

                        keepGenerating = true;
                    } else {
                        const finalPayload = {
                            id: `chatcmpl-${reqId}`,
                            object: "chat.completion.chunk",
                            created: Math.floor(Date.now() / 1000),
                            model: fallbackModelName,
                            choices: [
                                {
                                    index: 0,
                                    delta: {},
                                    finish_reason: "stop"
                                }
                            ]
                        };
                        res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
                        res.write(`data: [DONE]\n\n`);
                        res.end();
                    }
                } catch (streamError) {
                    console.error("Stream generation error:", streamError);
                    res.write(`data: {"error": "Internal server error"}\n\n`);
                    res.end();
                    keepGenerating = false;
                }
            }
        } else {
            // Non-streaming logic
            let currentContents = [...contents];
            let keepGenerating = true;
            let fullText = "";

            while (keepGenerating) {
                keepGenerating = false;

                try {
                    const response = await ai.generateContent(modelName, currentContents, config);

                    if (response.functionCalls && response.functionCalls.length > 0) {
                        currentContents.push({
                            role: "model",
                            parts: response.functionCalls.map((fc: any) => ({ functionCall: fc }))
                        });

                        const toolResponses = [];
                        for (const fc of response.functionCalls) {
                            const result = await executeToolHandler(fc.name, fc.args, {
                                userId: user?.id,
                                sessionId: sessionId,
                                io: (req as any).app.get('io')
                            });
                            toolResponses.push({
                                functionResponse: {
                                    name: fc.name,
                                    response: { result }
                                }
                            });
                        }

                        currentContents.push({
                            role: "user",
                            parts: toolResponses
                        });

                        keepGenerating = true;
                    } else {
                        if (response.text) {
                            fullText += response.text;
                        }
                    }
                } catch (error) {
                    console.error("Non-stream generation error:", error);
                    return res.status(500).json({ error: "Internal server error" });
                }
            }

            res.json({
                id: `chatcmpl-${crypto.randomUUID()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: fallbackModelName,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: fullText
                        },
                        finish_reason: "stop"
                    }
                ],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            });
        }
    } catch (e) {
        console.error("Error in chatCompletions:", e);
        res.status(500).json({ error: "Internal server error" });
    }
};
