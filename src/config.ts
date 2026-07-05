/**
 * Environment-based config shared by all YapZee services.
 *
 * Lazy by design: reading `process.env` happens at property-access time
 * (via getters), not at import time, so importing this module never throws
 * even when no env vars are set (mirrors the Python `Settings` behavior of
 * never raising at import — the underlying values are just `undefined`).
 */

export const settings = {
  get OPENAI_API_KEY(): string | undefined {
    return process.env.OPENAI_API_KEY;
  },
  get ANTHROPIC_API_KEY(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  },
  get GOOGLE_API_KEY(): string | undefined {
    return process.env.GOOGLE_API_KEY;
  },
  get XAI_API_KEY(): string | undefined {
    return process.env.XAI_API_KEY;
  },
  get OPENROUTER_API_KEY(): string | undefined {
    return process.env.OPENROUTER_API_KEY;
  },
  get AZURE_SPEECH_KEY(): string | undefined {
    return process.env.AZURE_SPEECH_KEY;
  },
  get AZURE_SPEECH_REGION(): string | undefined {
    return process.env.AZURE_SPEECH_REGION;
  },
};

export interface ModelInfo {
  label: string;
  provider: "gemini" | "anthropic" | "openai" | "xai" | "openrouter";
  value: string;
  base_url?: string;
}

// Shared Model Options for all services
export const MODELS: ModelInfo[] = [
  { label: "Gemini 3 Flash", provider: "gemini", value: "gemini-3-flash-preview" },
  { label: "Sonnet 4.6", provider: "anthropic", value: "claude-sonnet-4-6" },
  { label: "GPT-5.4", provider: "openai", value: "gpt-5.4" },
  {
    label: "Grok 4.1 Fast Reasoning",
    provider: "xai",
    value: "grok-4-1-fast-reasoning",
    base_url: "https://api.x.ai/v1",
  },
  {
    label: "Llama 4 Maverick (Deepinfra)",
    provider: "openrouter",
    value: "meta-llama/llama-4-maverick",
    base_url: "https://openrouter.ai/api/v1",
  },
];

// JWT configuration for the Auth module. Read lazily (at access time), same
// as `settings` above — importing this module must not require
// YAPZEE_JWT_SECRET to be set.
export const JWT_ALGORITHM = "HS256";

export function getJwtSecret(): string | undefined {
  return process.env.YAPZEE_JWT_SECRET;
}

export function getJwtTtlDays(): number {
  return Number.parseInt(process.env.YAPZEE_JWT_TTL_DAYS ?? "30", 10);
}
