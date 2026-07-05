/** Shared YapZee library: LLM provider routing, config, JWT helpers, internal auth, lesson parsing. */

export { streamLlm } from "./llm.js";
export { settings, MODELS } from "./config.js";
export type { ModelInfo } from "./config.js";
export { createToken, decodeToken, requireJwtSecret } from "./auth.js";
export { requireInternalKey, checkInternalKey } from "./internalAuth.js";
export type { InternalKeyCheckResult } from "./internalAuth.js";
export {
  CHARS_PER_SECOND,
  ES_TAG_RE,
  ELLIPSIS_RE,
  cleanSpokenText,
  isSkippable,
  normalizePauses,
  findAnswerText,
  calculatePauseDuration,
  parseToSegments,
  parseExpectedAnswers,
  estimateTimestamps,
  stripToSpokenScript,
} from "./lessonParser.js";
export type { Segment, ExpectedAnswer, Timestamp } from "./lessonParser.js";
