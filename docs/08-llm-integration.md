# LLM Integration

One streaming interface over five providers. User picks the model per generation.

## LLM Rules

**Files**: `yapzee_common.llm`, `yapzee_common.config` (model list) — moved out of the old monolith's `backend/app/` into the `yapzee-common` package (`github.com/pisithrps/yapzee-common`) as part of the microservices split; each service that needs it (today, `content`) consumes it as a uv git dependency.
**Never**: Call a provider SDK from a router — go through `stream_llm()`. Add a provider without adding it to `yapzee_common.config` and `GET /models`. Hard-code model IDs in routers.
**Always**: Add a provider by adding a new branch in `stream_llm()` — don't modify existing branches. Keep temperature 0.6 for content; 1.0 is only for the voice agent (which bypasses `yapzee_common.llm`).
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

`stream_llm()` branches on `model_info["provider"]`:

| Provider | SDK | Notes |
|----------|-----|-------|
| `gemini` | `google-genai` | `generate_content_stream()`, yields text chunks |
| `anthropic` | `anthropic` | `.messages.stream()` context manager, yields `text_delta` |
| `openai` | `openai` | `chat.completions.create(stream=True)`, yields `delta.content` |
| `xai` | `openai` with `base_url="https://api.x.ai/v1"` | OpenAI-compatible |
| `openrouter` | `openai` with `base_url="https://openrouter.ai/api/v1"` | Uses `extra_body={"provider": {"order": ["DeepInfra"]}}` to pin inference |

## Generation parameters

| Parameter | Value |
|-----------|-------|
| Temperature | 0.6 |
| Top-P | 0.9 |

Voice agent uses 1.0 and bypasses this module.

## Streaming

All generation endpoints return `text/event-stream`. Flow:

1. Frontend POSTs generation params.
2. Backend opens a streaming LLM call inside `StreamingResponse`.
3. Each chunk yielded as an SSE event.
4. Frontend appends to a textarea in real time.
5. On stream end, backend concatenates and saves to disk.

## Environment

Loaded by `Settings` in `yapzee_common.config`:

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
