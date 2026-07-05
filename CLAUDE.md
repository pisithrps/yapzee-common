# yapzee-common

Shared Python **library** (not a service — no port, no Dockerfile). Published
as a `uv` git dependency (hatchling build), not PyPI. Current version `0.2.0`.
Consumed by all 5 sibling services (yapzee-auth, yapzee-memory,
yapzee-content, yapzee-podcast, yapzee-voice).

**Modules:** `llm` (provider routing / `stream_llm`), `config` (`settings`,
`MODELS`, JWT env vars), `auth` (JWT create/decode), `internal_auth`
(`require_internal_key` — defines the `X-Internal-Key` service-to-service
header), `lesson_parser` (lesson markdown → speak/pause segments).

**Rule:** all LLM provider routing goes through `llm.py` (Strategy pattern).
Never call a provider SDK directly from consumer services.

Test: `uv run --group dev pytest -q`.
