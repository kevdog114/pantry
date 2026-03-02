import { Request, Response } from "express";
import { executeToolHandler } from "../gemini/toolHandlers";
import { getAllToolDefinitions } from "../gemini/toolDefinitions";
import { getGeminiModel } from "./GeminiController";
import * as crypto from "crypto";

// Transform OpenAI message history to Gemini format
function mapMessagesToGeminiContents(messages: any[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            continue; // system instructions are handled separately
        }

        let role = msg.role === 'user' ? 'user' : 'model';
        let parts: any[] = [];

        if (msg.role === 'assistant' && msg.tool_calls) {
            parts.push({
                functionCall: {
                    name: msg.tool_calls[0].function.name,
                    args: JSON.parse(msg.tool_calls[0].function.arguments)
                }
            });
        } else if (msg.role === 'tool') {
            role = 'user'; // function responses come from the user in Gemini
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

// Convert Gemini tool schema to new SDK tool structure if needed,
// but the new SDK supports the format provided by getAllToolDefinitions
function adaptTools(tools: any[]) {
    return tools;
}

export const getModels = async (req: Request, res: Response) => {
    // Return standard OpenAI model format
    res.json({
        object: "list",
        data: [
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
        const sessionId = req.body.session_id || 1; // Default to 1 if not provided, for chat context

        // Find system message
        const systemMessage = messages.find((m: any) => m.role === 'system');
        const systemInstruction = systemMessage ? systemMessage.content : `You are a smart cooking assistant managing a pantry. Date: ${new Date().toLocaleDateString()}.`;

        const contents = mapMessagesToGeminiContents(messages);

        // Setup config
        const config: any = {
            systemInstruction,
            temperature: temperature ?? 0.7,
            tools: adaptTools(getAllToolDefinitions())
        };
        if (top_p) config.topP = top_p;
        if (max_tokens) config.maxOutputTokens = max_tokens;

        const featureKey = "gemini_router_model";
        const fallbackModelName = modelId || "gemini-flash-latest";

        const { model } = await getGeminiModel(featureKey, fallbackModelName);

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
                    const resultStream = await model.generateContentStream({
                        contents: currentContents,
                        config
                    });

                    let functionCallsQueue: any[] = [];
                    let fullText = "";

                    for await (const chunk of resultStream) {
                        const candidates = chunk.candidates?.[0] || chunk;
                        const functionCalls = candidates.functionCalls ||
                            candidates.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

                        if (functionCalls && functionCalls.length > 0) {
                            functionCallsQueue.push(...functionCalls);
                        } else {
                            const textPart = candidates.content?.parts?.find((p: any) => typeof p.text === 'string')?.text || chunk.text;
                            if (textPart) {
                                fullText += textPart;

                                // Stream chunks to OpenAI client
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
                        // Append the model's tool calls to History
                        currentContents.push({
                            role: "model",
                            parts: functionCallsQueue.map(fc => ({ functionCall: fc }))
                        });

                        // Execute tool functions
                        const toolResponses = [];
                        for (const fc of functionCallsQueue) {
                            const result = await executeToolHandler(fc.name, fc.args, {
                                userId: user?.id,
                                sessionId: sessionId,
                                io: (req as any).app.get('io') // Assuming io is set on app, but it might not be. Wait, io is used in printReceipt
                            });
                            toolResponses.push({
                                functionResponse: {
                                    name: fc.name,
                                    response: result
                                }
                            });
                        }

                        // Append tool responses to History
                        currentContents.push({
                            role: "user",
                            parts: toolResponses
                        });

                        keepGenerating = true; // Auto-loop
                    } else {
                        // Finished
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
                    const response = await model.generateContent({
                        contents: currentContents,
                        config
                    });

                    const candidates = response.candidates?.[0] || response;
                    const functionCalls = candidates.functionCalls ||
                        candidates.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

                    if (functionCalls && functionCalls.length > 0) {
                        currentContents.push({
                            role: "model",
                            parts: functionCalls.map((fc: any) => ({ functionCall: fc }))
                        });

                        const toolResponses = [];
                        for (const fc of functionCalls) {
                            const result = await executeToolHandler(fc.name, fc.args, {
                                userId: user?.id,
                                sessionId: sessionId,
                                io: (req as any).app.get('io')
                            });
                            toolResponses.push({
                                functionResponse: {
                                    name: fc.name,
                                    response: result
                                }
                            });
                        }

                        currentContents.push({
                            role: "user",
                            parts: toolResponses
                        });

                        keepGenerating = true;
                    } else {
                        const textPart = candidates.content?.parts?.find((p: any) => typeof p.text === 'string')?.text || response.text;
                        if (textPart) {
                            fullText += textPart;
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
