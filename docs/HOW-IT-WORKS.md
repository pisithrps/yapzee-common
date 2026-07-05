# How yapzee-common works

## What this is, and why it exists

`yapzee-common` is a small TypeScript library, running on Bun, shared across
YapZee's services. YapZee started as one monolith backend, was carved into
microservices (originally Python/FastAPI), and is now being ported service by
service to TypeScript on Bun (see `yapzee-docs's ARCHITECTURE.md`).
This library is first in that migration order because every service depends
on it: talking to LLM (large language model) providers, reading environment
config, minting/checking JWTs (JSON Web Tokens), gating internal endpoints,
and parsing lesson transcripts. Rather than copy-pasting `llm.ts` into every
service and letting the copies drift, that code lives here once, and every
service imports it.

The five sibling services — `yapzee-auth`, `yapzee-memory`,
`yapzee-content`, `yapzee-podcast`, and `yapzee-voice` — consume this
package as a git dependency (Bun resolves `github:` deps directly, same
model as the old `uv` git dependency). Their own migrations to Bun happen
after this one, in dependency order.

## The 30-second mental model

The library is five independent modules under `src/`. None of them import
from each other except `llm.ts` and `auth.ts`, which both read from
`config.ts`:

- **`config.ts`** — reads API keys and settings from environment variables
  lazily (via getters, at property-access time, not at import time) into a
  `settings` object. Also defines `MODELS`, the menu of LLM options every
  service picks from.
- **`llm.ts`** — one function, `streamLlm`, an async generator that takes a
  prompt and a `ModelInfo` object from `MODELS` and yields text chunks back,
  regardless of which of five providers is backing that model.
- **`auth.ts`** — mints and verifies JWTs (signed tokens that prove "this
  request came from user X, and it hasn't expired") using `jose`.
- **`internalAuth.ts`** — a Hono middleware (`requireInternalKey`) plus a
  pure function (`checkInternalKey`) that gate service-to-service endpoints
  behind a shared secret header.
- **`lessonParser.ts`** — turns a lesson transcript (a Markdown file with
  narrator lines, pause markers, and answer lines) into structured data:
  timed speak/pause segments, expected answers, and timestamps.

A service imports only what it needs from `src/index.ts`. A service that
never touches auth never has to think about JWT secrets.

## Walkthrough: one real call to `streamLlm`

Say a service wants a Gemini response streamed back to a caller. It picks
the Gemini entry out of `MODELS`:

```ts
const modelInfo = { label: "Gemini 3 Flash", provider: "gemini", value: "gemini-3-flash-preview" };
```

It calls `streamLlm(prompt, modelInfo)`. Inside, `streamLlm` reads
`modelInfo.provider` — here, `"gemini"` — and branches to the Gemini code
path. It builds a `GoogleGenAI` client using `settings.GOOGLE_API_KEY`
(read lazily from the environment), calls `generateContentStream`, and
`yield`s each chunk's `.text` as it arrives. The caller just does
`for await (const chunk of streamLlm(...))` and gets a stream of text
pieces — it never needs to know it was Gemini specifically, or how
Gemini's SDK differs from OpenAI's or Anthropic's.

The same function handles the other four providers (OpenAI, Anthropic,
xAI, OpenRouter) the same way: look at `provider`, pick the matching SDK
client, yield chunks back in a common shape. `xai` and `openrouter` are
OpenAI-API-compatible, so they reuse the `openai` client with a different
`baseURL`. If `provider` doesn't match a known value, `streamLlm` throws —
a caller passing a bad `modelInfo` fails immediately instead of silently
doing nothing.

## The JWT (JSON Web Token) story

A JWT is a signed, tamper-evident token that encodes a claim — here, "this
is user `<id>`, and this token expires at `<time>`." One service mints
tokens on login by calling `createToken(userId)`. Any service can then
verify a token it receives by calling `decodeToken(token)`, which resolves
to the `userId` if the signature and expiry check out, or `null` if the
token is invalid or expired. Because verification only needs the shared
secret (not a network call back to the auth service), any service can check
a token locally.

Both `createToken` and `decodeToken` start by calling `requireJwtSecret()`,
which throws if `YAPZEE_JWT_SECRET` isn't set in the environment. This
check is deliberately **lazy** — it runs when a JWT function is *called*,
not when `config.ts` is *imported*. That matters because `config.ts` is
imported by every service, including ones that never touch auth at all (a
lesson-parsing service, say). If the JWT secret check ran at import time,
every service would be forced to set `YAPZEE_JWT_SECRET` just to import the
config module, even services with no concept of a logged-in user. Making it
lazy means only services that actually call `createToken` or `decodeToken`
need that env var set; the `yapzee-auth` service additionally calls
`requireJwtSecret()` directly at startup so it fails fast at boot instead of
on the first login request.

## The lesson-parser story

YapZee's lessons are Pimsleur-style (Pimsleur is the classic audio
language-learning method built on prompt–pause–answer drills): a narrator
prompts the learner to recall a word or phrase, there's a silence for the
learner to think and speak, then the correct answer is read aloud. Lesson
content is authored as Markdown with a `{{PAUSE}}` marker between the
narrator's prompt and a line like `-- Answer: hola --`. `lessonParser.ts`
turns that Markdown into the data downstream consumers need:

- `parseToSegments` walks the transcript and emits an ordered list of
  `{type: "speak", ...}` and `{type: "pause", ...}` segments — this is what
  feeds a TTS (text-to-speech) pipeline that needs to know exactly when to
  talk and when to go silent.
- `parseExpectedAnswers` extracts just the prompt/answer pairs, for scoring
  what the learner said during a pause.
- `estimateTimestamps` walks the same content and estimates, in seconds,
  when each pause starts — used to sync UI (like highlighting vocabulary)
  to audio playback.
- `stripToSpokenScript` produces a flat block of spoken text with all
  markers removed, for TTS engines that don't need pause timing.

The pause duration itself comes from `calculatePauseDuration(answerText)`:
**`2.5 + 0.6 × wordCount`, clamped to the range [3.0, 8.0] seconds.** The
product reasoning: a one-word answer needs a shorter thinking pause than a
five-word phrase, but every pause needs a floor (3 seconds — long enough to
start speaking) and a ceiling (8 seconds — long enough to think, but not so
long the lesson drags). This mirrors Pimsleur's "principle of anticipation"
— give the learner just enough silence to produce the answer before it's
revealed, whether by recall or best guess.

`normalizePauses` also does cleanup work before parsing: LLM-generated
lesson content is sometimes inconsistent about how it marks pauses (using
`<pause>`, `[pause]`, empty code fences, or omitting a marker before an
answer line entirely), so this pass normalizes all of those to a single
`{{PAUSE}}` token before the rest of the parser runs. It also strips
syllable-break hyphens (like `per-do-na`) out of `<es>` (Spanish) tags,
since those hyphens are an authoring convention that would otherwise leak
into the TTS input and corrupt pronunciation.

## Versioning and how consumers pick up changes

There's no npm-registry publish step for this library — Bun-based services
depend on it directly from GitHub (`"yapzee-common": "github:pisithrps/yapzee-common"`
in `package.json`). A consumer pins to a commit implicitly through its own
`bun.lock` file. To pick up a change made here, a consumer runs
`bun update yapzee-common`, which re-resolves against the latest commit on
`main` and updates its own lock file.

Python services on the pre-migration stack are unaffected by any of this:
they resolved this repo via `uv` at a pinned commit SHA in their own
`uv.lock`, and replacing `main` with the TypeScript port doesn't move that
pin. They keep working against the last Python commit until each of them is
individually ported to Bun per SD-06's migration order.

## Why one shared library instead of copies

Before the microservices split, `config.py`, `llm.py`, and
`lesson_parser.py` lived inside the monorepo backend. As more services were
planned, the alternative to a shared library was copying those files into
each new service's own tree. That guarantees drift: a bug fix or a new
provider added to `llm.ts` in one service silently doesn't exist in the
others, and nobody notices until a service using the stale copy misbehaves
in production. Pulling this logic into one versioned package means every
service gets the same behavior, and a fix or feature lands everywhere the
next time each consumer bumps its lock file — on its own schedule, since
nothing forces an upgrade.
