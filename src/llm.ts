import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { settings } from "./config.js";
import type { ModelInfo } from "./config.js";

/**
 * One streaming entry point over five LLM providers. Mirrors the Python
 * `stream_llm` generator: yields only non-empty text chunks, and throws on
 * an unrecognized provider.
 */
export async function* streamLlm(
  prompt: string,
  modelInfo: Pick<ModelInfo, "provider" | "value" | "base_url">,
): AsyncGenerator<string> {
  const { provider, value: modelName } = modelInfo;

  if (provider === "openai" || provider === "xai") {
    const apiKey = provider === "xai" ? settings.XAI_API_KEY : settings.OPENAI_API_KEY;
    const client = new OpenAI({ apiKey, baseURL: modelInfo.base_url });
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  } else if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: settings.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: modelName,
      max_tokens: 8192,
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }
  } else if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: settings.GOOGLE_API_KEY });
    const stream = await client.models.generateContentStream({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.6 },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  } else if (provider === "openrouter") {
    const client = new OpenAI({
      apiKey: settings.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    // OpenRouter's `provider` routing hint isn't part of the OpenAI SDK's
    // types (it's an OpenRouter-specific body extension, equivalent to the
    // Python client's `extra_body`), so it's added via a typed cast.
    const body = {
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      stream: true,
      provider: { order: ["DeepInfra"] },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & {
      provider: { order: string[] };
    };
    const stream = await client.chat.completions.create(body);
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  } else {
    throw new Error(`Unknown provider: ${provider as string}`);
  }
}
