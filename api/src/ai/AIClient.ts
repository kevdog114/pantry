/**
 * Provider-agnostic AI client interface.
 * All AI-consuming code should depend on this interface rather than a specific SDK.
 */

/**
 * A single part of a message (text, function call, function response, or image).
 * Matches Gemini's part format for internal use.
 */
export interface AIPart {
  text?: string;
  functionCall?: { id?: string; name: string; args: Record<string, any> };
  functionResponse?: { id?: string; name: string; response: { result: string } };
  inlineData?: { data: string; mimeType: string };
  thoughtSignature?: string;
}

/**
 * A single message in the conversation.
 */
export interface AIContent {
  role: string; // "user" | "model" | "system"
  parts: AIPart[];
}

/**
 * JSON Schema for a tool/function definition (provider-agnostic).
 * Uses lowercase type values (JSON Schema standard).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, any>;
    items?: any;
    required?: string[];
    enum?: string[];
    nullable?: boolean;
  };
  required?: string[];
}

/**
 * Configuration for a generateContent call.
 */
export interface GenerateContentConfig {
  systemInstruction?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

/**
 * Non-streaming response from generateContent.
 */
export interface GenerateContentResult {
  text: string;
  functionCalls: { name: string; args: Record<string, any> }[];
  rawParts: AIPart[];
  usageMetadata?: any;
  [key: string]: any;
}

/**
 * Single chunk from a streaming response.
 */
export interface StreamChunk {
  text: string;
  functionCalls: { name: string; args: Record<string, any> }[];
  rawParts: AIPart[];
}

/**
 * Streaming response – an async iterable of chunks.
 */
export interface GenerateContentStreamResult {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk, void, unknown>;
}

/**
 * Provider-agnostic AI client.
 */
export interface AIClient {
  /**
   * Generate a non-streaming response.
   */
  generateContent(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentResult>;

  /**
   * Generate a streaming response.
   */
  generateContentStream(
    model: string,
    contents: AIContent[],
    config?: GenerateContentConfig
  ): Promise<GenerateContentStreamResult>;

  /**
   * Analyze an image with text prompt. Returns structured text response.
   */
  analyzeImage(
    model: string,
    prompt: string,
    imageData: { data: string; mimeType: string },
    config?: GenerateContentConfig
  ): Promise<GenerateContentResult>;

  /**
   * Return the provider identifier (e.g., "gemini", "openai").
   */
  getProviderId(): string;
}
