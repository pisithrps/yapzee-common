# LLM Integration

One streaming interface over five providers. User picks the model per generation.

## LLM Rules

**Files**: `src/llm.ts`, `src/config.ts` (model list) — TypeScript port (SD-06) of the original Python `yapzee_common.llm`/`.config`; each Bun service that needs it consumes this package as a git dependency.
**Never**: Call a provider SDK from a router — go through `streamLlm()`. Add a provider without adding it to `MODELS` in `src/config.ts` and `GET /models`. Hard-code model IDs in routers.
**Always**: Add a provider by adding a new branch in `streamLlm()` — don't modify existing branches. Keep temperature 0.6 for content; 1.0 is only for the voice agent (which bypasses `yapzee-common`'s `llm.ts`).
**Verify**: `GET /models` lists the new provider and a test generation streams successfully.

---

## Providers

| Label | Provider | Model ID |
|-------|----------|----------|
| Gemini 3 Flash | `gemini` | `gemini-3-flash-preview` |
| Sonnet 4.6 | `anthropic` | `claude-sonnet-4-6` |
| GPT-5.4 | `openai` | `gpt-5.4` |
| Grok 4.1 Fast Reasoning | `xai` | `grok-4-1-fast-reasoning` |
| Llama 4 Maverick (Deepinfra) | `openrouter` | `meta-llama/llama-4-maverick` |

Model list lives in `yapzee_common.config`; served to the frontend via `GET /models`.

## Routing

`streamLlm()` branches on `modelInfo.provider`:

| Provider | SDK | Notes |
|----------|-----|-------|
| `gemini` | `@google/genai` | `generateContentStream()`, yields text chunks |
| `anthropic` | `@anthropic-ai/sdk` | `.messages.stream()` async iterator, yields `text_delta` events |
| `openai` | `openai` | `chat.completions.create({stream: true})`, yields `delta.content` |
| `xai` | `openai` with `baseURL="https://api.x.ai/v1"` | OpenAI-compatible |
| `openrouter` | `openai` with `baseURL="https://openrouter.ai/api/v1"` | Body extended with `{provider: {order: ["DeepInfra"]}}` to pin inference |

## Generation parameters

| Parameter | Value |
|-----------|-------|
| Temperature | 0.6 |
| Top-P | 0.9 |

Voice agent uses 1.0 and bypasses this module.

## Streaming

`streamLlm()` is an `AsyncGenerator<string>`. All generation endpoints return
`text/event-stream`. Flow:

1. Frontend POSTs generation params.
2. Backend consumes `streamLlm()` inside a Hono SSE response.
3. Each chunk yielded as an SSE event.
4. Frontend appends to a textarea in real time.
5. On stream end, backend concatenates and saves to disk.

## Environment

Read lazily (at property-access time) by `settings` in `src/config.ts`:

```
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_API_KEY
XAI_API_KEY        # optional — needed only if Grok is selected
OPENROUTER_API_KEY # optional — needed only if Llama 4 is selected
```

Missing keys don't break the app — they just fail generations that try to use the corresponding provider.

## Why multi-provider

Different models excel at different parts of the pipeline. Cultural content might favor one model; structured curriculum content another. Per-call choice avoids forcing the decision into code.

## Why OpenAI SDK for xAI and OpenRouter

Both expose OpenAI-compatible endpoints. Reusing the SDK with a `base_url` override avoids pulling in more dependencies. OpenRouter's `extra_body` lets us pin Llama 4 to Deepinfra for price/latency.

## Why SSE

Generation takes 30–120s. Streaming tokens as they arrive beats staring at a spinner — users can catch format or language errors early and cancel. Unidirectional, HTTP-native, plays nicely with proxies.
