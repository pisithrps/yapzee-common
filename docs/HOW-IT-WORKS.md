# How yapzee-common works

## What this is, and why it exists

`yapzee-common` is a small Python library shared across YapZee's services.
YapZee started as one monolith backend, but the code was carved out into
separate microservices, and three pieces of logic — talking to LLM (large
language model) providers, reading environment config, and minting/checking
JWTs (JSON Web Tokens) — were needed by more than one service. Rather than
copy-pasting `llm.py` into every new service and letting the copies drift,
that code now lives here once, and every service imports it.

Today there is one real consumer: the monorepo backend (`yapzee/backend`).
It used to have its own `app/config.py`, `app/llm.py`, and
`app/lesson_parser.py`; those files were deleted and replaced with imports
from `yapzee_common`. Future services (content generation, podcast
rendering, a standalone auth service) are expected to depend on this
library too, which is why it's versioned and distributed independently
instead of living inside the monorepo.

## The 30-second mental model

The library is four independent modules. None of them import from each
other except `llm.py` and `auth.py`, which both read from `config.py`:

- **`config.py`** — reads API keys and settings from environment variables
  once, at import time, into a `settings` object. Also defines `MODELS`, the
  menu of LLM options every service picks from.
- **`llm.py`** — one function, `stream_llm`, that takes a prompt and a
  `model_info` dict from `MODELS` and streams back text chunks, regardless
  of which of five providers is backing that model.
- **`auth.py`** — mints and verifies JWTs (signed tokens that prove "this
  request came from user X, and it hasn't expired").
- **`lesson_parser.py`** — turns a lesson transcript (a Markdown file with
  narrator lines, pause markers, and answer lines) into structured data:
  timed speak/pause segments, expected answers, and timestamps.

A service imports only what it needs. A service that never touches auth
never has to think about JWT secrets.

## Walkthrough: one real call to `stream_llm`

Say a service wants a Gemini response streamed back to a caller. It picks
the Gemini entry out of `MODELS`:

```python
model_info = {"label": "Gemini 3 Flash", "provider": "gemini", "value": "gemini-3-flash-preview"}
```

It calls `stream_llm(prompt, model_info)`. Inside, `stream_llm` reads
`model_info["provider"]` — here, `"gemini"` — and branches to the Gemini
code path. It builds a `genai.Client` using `settings.GOOGLE_API_KEY` (which
`config.py` already loaded from the environment), calls
`generate_content_stream`, and `yield`s each chunk's `.text` as it arrives.
The caller just iterates over the generator and gets a stream of text
pieces — it never needs to know it was Gemini specifically, or how Gemini's
SDK differs from OpenAI's or Anthropic's.

The same function handles the other four providers (OpenAI, Anthropic, xAI,
OpenRouter) the same way: look at `provider`, pick the matching SDK client,
stream chunks back in a common shape. `xai` and `openrouter` are OpenAI-API-
compatible, so they reuse the `openai` client with a different `base_url`.
If `provider` doesn't match a known value, `stream_llm` raises
`ValueError` — a caller passing a bad `model_info` fails immediately instead
of silently doing nothing.

## The JWT (JSON Web Token) story

A JWT is a signed, tamper-evident token that encodes a claim — here, "this
is user `<id>`, and this token expires at `<time>`." One service (today,
the monorepo's auth routes) mints tokens on login by calling
`create_token(user_id)`. Any service — the same one or a different one —
can then verify a token it receives by calling `decode_token(token)`, which
returns the `user_id` if the signature and expiry check out, or `None` if
the token is invalid or expired. Because verification only needs the shared
secret (not a network call back to the auth service), any service can check
a token locally.

Both `create_token` and `decode_token` start by calling
`require_jwt_secret()`, which raises `RuntimeError` if `YAPZEE_JWT_SECRET`
isn't set in the environment. This check is deliberately **lazy** — it runs
when a JWT function is *called*, not when `config.py` is *imported*. That
matters because `config.py` is imported by every service, including ones
that never touch auth at all (a lesson-parsing service, say). If the JWT
secret check ran at import time, every service would be forced to set
`YAPZEE_JWT_SECRET` just to import the config module, even services with no
concept of a logged-in user. Making it lazy means only services that
actually call `create_token` or `decode_token` need that env var set; the
monorepo backend additionally calls `require_jwt_secret()` directly at
startup (in `main.py`) so it fails fast at boot instead of on the first
login request.

## The lesson-parser story

YapZee's lessons are Pimsleur-style (Pimsleur is the classic audio
language-learning method built on prompt–pause–answer drills): a narrator prompts the learner to
recall a word or phrase, there's a silence for the learner to think and
speak, then the correct answer is read aloud. Lesson content is authored as
Markdown with a `{{PAUSE}}` marker between the narrator's prompt and a line
like `-- Answer: hola --`. `lesson_parser.py` turns that Markdown into the
data downstream consumers need:

- `parse_to_segments` walks the transcript and emits an ordered list of
  `{"type": "speak", ...}` and `{"type": "pause", ...}` segments — this is
  what feeds a TTS (text-to-speech) pipeline that needs to know exactly when to
  talk and when to go silent.
- `parse_expected_answers` extracts just the prompt/answer pairs, for
  scoring what the learner said during a pause.
- `estimate_timestamps` walks the same content and estimates, in seconds,
  when each pause starts — used to sync UI (like highlighting vocabulary)
  to audio playback.
- `strip_to_spoken_script` produces a flat block of spoken text with all
  markers removed, for TTS engines that don't need pause timing.

The pause duration itself comes from `calculate_pause_duration(answer_text)`:
**`2.5 + 0.6 × word_count`, clamped to the range [3.0, 8.0] seconds.** The
product reasoning: a one-word answer needs a shorter thinking pause than a
five-word phrase, but every pause needs a floor (3 seconds — long enough to
start speaking) and a ceiling (8 seconds — long enough to think, but not so
long the lesson drags). This mirrors Pimsleur's "principle of anticipation"
— give the learner just enough silence to produce the answer before it's
revealed, whether by recall or best guess.

`_normalize_pauses` also does cleanup work before parsing: LLM-generated
lesson content is sometimes inconsistent about how it marks pauses (using
`<pause>`, `[pause]`, empty code fences, or omitting a marker before an
answer line entirely), so this pass normalizes all of those to a single
`{{PAUSE}}` token before the rest of the parser runs. It also strips
syllable-break hyphens (like `per-do-na`) out of `<es>` (Spanish) tags,
since those hyphens are an authoring convention that would otherwise leak
into the TTS input and corrupt pronunciation.

## Versioning and how consumers pick up changes

There's no PyPI (Python Package Index) publish step for this library —
services depend on it directly from GitHub via `uv`'s git-dependency
support (`[tool.uv.sources]` in the consumer's `pyproject.toml`). A
consumer pins to a commit implicitly through its own `uv.lock` file, which
records the exact git revision that was resolved. To pick up a change made
here, a consumer runs `uv lock --upgrade-package yapzee-common && uv sync`,
which re-resolves against the latest commit on `main` and updates its own
lock file.

This repo's own `uv.lock` is gitignored (see `.gitignore`) — it's not
committed here. A library's lock file only pins *its own* dev/test
dependencies for local development; it has no bearing on what a consumer
resolves, since the consumer's `pyproject.toml` and lock file are what
actually govern its dependency graph. Committing it here would just be
noise that goes stale the moment a consumer's resolution differs.

## Why one shared library instead of copies

Before this split, `config.py`, `llm.py`, and `lesson_parser.py` lived
inside the monorepo backend. As more services were planned (content
generation, podcast rendering), the alternative to a shared library was
copying those files into each new service's own tree. That guarantees
drift: a bug fix or a new provider added to `llm.py` in one service
silently doesn't exist in the others, and nobody notices until a service
using the stale copy misbehaves in production. Pulling this logic into one
versioned package means every service gets the same behavior, and a fix or
feature lands everywhere the next time each consumer bumps its lock file —
on its own schedule, since nothing forces an upgrade.
