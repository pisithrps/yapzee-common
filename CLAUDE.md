# yapzee-common

Shared TypeScript **library** on Bun (not a service — no port, no
Dockerfile). Ported from Python per `SD-06-typescript-bun-migration.md`
(yapzee-docs). Consumed as a Bun/npm workspace git dependency by all 5
sibling services (yapzee-auth, yapzee-memory, yapzee-content,
yapzee-podcast, yapzee-voice) once each is ported to TS.

**Modules (`src/`):** `llm.ts` (provider routing / `streamLlm`), `config.ts`
(`settings`, `MODELS`, JWT env accessors), `auth.ts` (JWT create/decode via
`jose`), `internalAuth.ts` (`requireInternalKey` Hono middleware +
`checkInternalKey` pure fn — defines the `X-Internal-Key` service-to-service
header), `lessonParser.ts` (lesson markdown → speak/pause segments).

**Rule:** all LLM provider routing goes through `llm.ts` (Strategy pattern).
Never call a provider SDK directly from consumer services.

Test: `bun test`. Typecheck: `bun run typecheck`.

**Python consumers on the old stack are unaffected:** they pin this repo by
commit SHA in their lockfiles and stay on their pinned pre-migration commit;
they do not resolve `main` automatically.
