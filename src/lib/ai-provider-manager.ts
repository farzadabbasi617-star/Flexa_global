import { aiCache } from "./ai-cache";
import logger from "@/lib/logger";

type AIProvider = "openrouter" | "groq" | "huggingface";

export interface AIProviderResult {
  content: string;
  provider: AIProvider | "cache";
  cachedProvider?: AIProvider;
  model?: string;
}

export function normalizeAIEnvValue(value: string | undefined) {
  if (!value) return "";
  let secret = value.trim();

  // Render values are sometimes pasted with wrapping quotes. If kept, providers
  // receive `Bearer "sk-..."` and reject with 401, making the assistant fall
  // back to local mode.
  if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) {
    secret = secret.slice(1, -1).trim();
  }

  if (secret.toLowerCase().startsWith("bearer ")) {
    secret = secret.slice(7).trim();
  }

  return secret;
}

export function isUsableAISecret(value: string) {
  return Boolean(value && !value.includes("your_") && value.length > 12);
}

type ApiKeyEnv = "OPENROUTER_API_KEY" | "GROQ_API_KEY" | "HUGGINGFACE_API_KEY";
type ModelEnv = "OPENROUTER_MODEL" | "GROQ_MODEL" | "HUGGINGFACE_MODEL";

const PROVIDERS: Array<{
  id: AIProvider;
  url: string;
  apiKeyEnv: ApiKeyEnv;
  modelEnv: ModelEnv;
  defaultModels: string[];
}> = [
  {
    id: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModels: [
      "google/gemini-2.5-flash",
      "google/gemini-2.0-flash-001",
      "google/gemini-flash-1.5",
      "meta-llama/llama-3.3-70b-instruct:free",
    ],
  },
  {
    id: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
  },
  {
    // HuggingFace Inference Router exposes an OpenAI-compatible chat endpoint,
    // so it slots into the same messages/Bearer flow as the others.
    id: "huggingface",
    url: "https://router.huggingface.co/v1/chat/completions",
    apiKeyEnv: "HUGGINGFACE_API_KEY",
    modelEnv: "HUGGINGFACE_MODEL",
    defaultModels: [
      "meta-llama/Llama-3.3-70B-Instruct",
      "Qwen/Qwen2.5-72B-Instruct",
      "meta-llama/Llama-3.1-8B-Instruct",
    ],
  },
];

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

function modelsFor(provider: (typeof PROVIDERS)[number]) {
  const envModel = normalizeAIEnvValue(process.env[provider.modelEnv]);
  return [...new Set([...(envModel ? [envModel] : []), ...provider.defaultModels])];
}

async function callProviderModel(
  provider: (typeof PROVIDERS)[number],
  model: string,
  prompt: string,
  systemPrompt: string,
  imageUrl?: string
): Promise<AIProviderResult | null> {
  const apiKey = normalizeAIEnvValue(process.env[provider.apiKeyEnv]);
  if (!isUsableAISecret(apiKey)) return null;

  const { signal, cancel } = timeoutSignal(22_000); // 22 seconds for multimodal processing

  try {
    // Construct OpenAI/OpenRouter compliant multimodal content block if imageUrl is present
    const userContent = imageUrl && provider.id === "openrouter"
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      : prompt;

    const response = await fetch(provider.url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider.id === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://www.flexa1.ir",
              "X-Title": "Flexa App",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 1800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logger.warn(
        { provider: provider.id, model, status: response.status, body: errorText.slice(0, 500) },
        "AI provider returned an error"
      );
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) {
      return { content: content.trim(), provider: provider.id, model };
    }

    logger.warn({ provider: provider.id, model }, "AI provider returned an empty response");
    return null;
  } catch (err) {
    logger.warn({ provider: provider.id, model, err }, "AI provider connection failed");
    return null;
  } finally {
    cancel();
  }
}

async function callProvider(
  provider: (typeof PROVIDERS)[number],
  prompt: string,
  systemPrompt: string,
  imageUrl?: string
): Promise<AIProviderResult | null> {
  if (!isUsableAISecret(normalizeAIEnvValue(process.env[provider.apiKeyEnv]))) return null;
  for (const model of modelsFor(provider)) {
    const result = await callProviderModel(provider, model, prompt, systemPrompt, imageUrl);
    if (result) return result;
  }
  return null;
}

/**
 * Multi-provider AI call with automatic failover:
 * OpenRouter (primary) -> Groq -> HuggingFace. Each provider tries its own list
 * of models in order, so any model/provider error transparently switches to the
 * next available one.
 * Supports an optional imageUrl parameter for multimodal analysis (like verifying match screenshots!).
 */
export async function fetchAIResponse(
  prompt: string, 
  systemPrompt: string, 
  imageUrl?: string
): Promise<AIProviderResult | null> {
  const cacheKey = `ai_${Buffer.from(`${systemPrompt}\n${prompt}\n${imageUrl || ""}`).toString("base64url")}`;
  const cached = aiCache.get(cacheKey) as { content: string; provider: AIProvider; model?: string } | null;
  if (cached?.content) {
    return { content: cached.content, provider: "cache", cachedProvider: cached.provider, model: cached.model };
  }

  for (const provider of PROVIDERS) {
    const result = await callProvider(provider, prompt, systemPrompt, imageUrl);
    if (result) {
      aiCache.set(cacheKey, { content: result.content, provider: result.provider, model: result.model }, 3600);
      return result;
    }
  }

  return null;
}

export interface AIProviderStreamResult {
  textStream: AsyncIterable<string>;
  provider: AIProvider | "cache";
  cachedProvider?: AIProvider;
  model?: string;
}

/** Parse OpenAI-compatible server-sent events into text deltas. */
export async function* parseOpenAITextStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;

        try {
          const event = JSON.parse(data);
          const content = event?.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content) yield content;
        } catch {
          // Ignore provider keep-alives or malformed non-content events. A
          // later valid event can still complete the answer.
        }
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

async function openProviderModelStream(
  provider: (typeof PROVIDERS)[number],
  model: string,
  prompt: string,
  systemPrompt: string
): Promise<{ source: AsyncIterable<string>; cancel: () => void } | null> {
  const apiKey = normalizeAIEnvValue(process.env[provider.apiKeyEnv]);
  if (!isUsableAISecret(apiKey)) return null;

  const { signal, cancel } = timeoutSignal(45_000);
  try {
    const response = await fetch(provider.url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider.id === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://www.flexa1.ir",
              "X-Title": "Flexa Telegram AI",
            }
          : {}),
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.55,
        max_tokens: 1200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      logger.warn(
        { provider: provider.id, model, status: response.status, body: errorText.slice(0, 300) },
        "AI streaming provider returned an error"
      );
      cancel();
      return null;
    }

    return { source: parseOpenAITextStream(response.body), cancel };
  } catch (err) {
    cancel();
    logger.warn({ provider: provider.id, model, err }, "AI streaming provider connection failed");
    return null;
  }
}

/**
 * Open a real token stream with provider/model failover before the first token.
 * Completed responses are cached and reused by both streaming and regular AI
 * calls. A mid-stream provider failure is surfaced to the caller rather than
 * restarting and duplicating already displayed text.
 */
export async function fetchAIResponseStream(
  prompt: string,
  systemPrompt: string
): Promise<AIProviderStreamResult | null> {
  const cacheKey = `ai_${Buffer.from(`${systemPrompt}\n${prompt}\n`).toString("base64url")}`;
  const cached = aiCache.get(cacheKey) as { content: string; provider: AIProvider; model?: string } | null;

  if (cached?.content) {
    async function* cachedStream() {
      yield cached!.content;
    }
    return {
      textStream: cachedStream(),
      provider: "cache",
      cachedProvider: cached.provider,
      model: cached.model,
    };
  }

  for (const provider of PROVIDERS) {
    if (!isUsableAISecret(normalizeAIEnvValue(process.env[provider.apiKeyEnv]))) continue;

    for (const model of modelsFor(provider)) {
      const opened = await openProviderModelStream(provider, model, prompt, systemPrompt);
      if (!opened) continue;

      async function* cacheCompletedStream() {
        let content = "";
        let completed = false;
        try {
          for await (const delta of opened!.source) {
            content += delta;
            yield delta;
          }
          completed = true;
        } finally {
          opened!.cancel();
          if (completed && content.trim()) {
            aiCache.set(cacheKey, { content: content.trim(), provider: provider.id, model }, 3600);
          }
        }
      }

      return {
        textStream: cacheCompletedStream(),
        provider: provider.id,
        model,
      };
    }
  }

  return null;
}
