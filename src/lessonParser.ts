/**
 * Shared lesson transcript parsing utilities.
 *
 * Used by the lesson/content pipeline and the podcast TTS pipeline to extract
 * expected answers and timing information from lesson markdown files.
 */

// Approximate speaking rate: ~150 words per minute -> 2.5 words/sec.
// Average word length ~5 chars + space -> ~15 chars/sec.
// Mirrors the backend's ssml_builder._CHARS_PER_SECOND (Azure TTS rate).
export const CHARS_PER_SECOND = 15;

export const ES_TAG_RE = /<es>(.*?)<\/es>/s;
export const ELLIPSIS_RE = /^[\s.…]+$/;

export type Segment =
  | { type: "speak"; text: string }
  | { type: "pause"; duration_seconds: number };

export interface ExpectedAnswer {
  turn_index: number;
  expected_answer: string;
  prompt_text: string;
}

export interface Timestamp {
  turn_index: number;
  estimated_seconds: number;
}

/** Clean a line of lesson text into speakable prose. */
export function cleanSpokenText(text: string): string {
  // Strip speaker labels but keep the text
  text = text.replace(/^\[.*?\]\s*/, "");
  // Strip bullet point markers
  text = text.replace(/^[-*+]\s+/, "");
  // Strip markdown emphasis (bold/italic asterisks and underscores)
  text = text.replace(/\*{1,2}(.+?)\*{1,2}/g, "$1");
  text = text.replace(/_{1,2}(.+?)_{1,2}/g, "$1");
  return text;
}

/** Check if a line is non-spoken content that should be skipped. */
export function isSkippable(stripped: string): boolean {
  if (!stripped) return true;
  if (stripped.includes("{{PAUSE}}")) return true;
  if (/^--\s*Answer:.*--\s*$/.test(stripped)) return true;
  if (/^--\s*.+\s*--\s*$/.test(stripped)) return true;
  if (stripped.startsWith("#")) return true;
  return false;
}

/**
 * Normalize common pause marker variants to the canonical {{PAUSE}}.
 *
 * LLMs sometimes output <pause>, <speak>, [pause], (pause), empty code
 * fences, or omit the pause marker entirely before `-- Answer:` lines.
 * This safety net ensures the downstream pipeline always sees {{PAUSE}}.
 * Also strips syllable-break hyphens inside <es> tags that corrupt TTS.
 */
export function normalizePauses(content: string): string {
  // Pass 1: replace known pause variants with {{PAUSE}}
  content = content.replace(/<(?:pause|speak)\s*\/?>|\[pause\]|\(pause\)/gi, "{{PAUSE}}");
  content = content.replace(/^`{2,3}\s*$/gm, "{{PAUSE}}");

  // Pass 2: strip syllable-break hyphens inside <es> tags.
  // "per-do-na" -> "perdona", "a-yu-dar" -> "ayudar"
  // Only removes hyphens surrounded by letters (not "—" em-dashes or
  // hyphens in answer-line markers like "-- Answer:").
  content = content.replace(/<es>(.*?)<\/es>/gs, (_match, inner: string) => {
    const stripped = inner.replace(
      /(?<=[a-záéíóúüñA-ZÁÉÍÓÚÜÑ])-(?=[a-záéíóúüñA-ZÁÉÍÓÚÜÑ])/g,
      "",
    );
    return `<es>${stripped}</es>`;
  });

  // Pass 3: inject {{PAUSE}} before any -- Answer: line that doesn't
  // already have one in the preceding 3 lines.
  const lines = content.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const stripped = line.trim();
    if (/^--\s*Answer:/.test(stripped)) {
      // Look back up to 3 lines for an existing {{PAUSE}}
      const hasPause = result
        .slice(Math.max(0, result.length - 3))
        .some((l) => l.includes("{{PAUSE}}"));
      if (!hasPause) {
        result.push("{{PAUSE}}");
      }
    }
    result.push(line);
  }

  return result.join("\n");
}

/** Find the answer text in the -- Answer: ... -- line after a {{PAUSE}}. */
export function findAnswerText(lines: string[], pauseIndex: number): string | null {
  for (let j = pauseIndex + 1; j < Math.min(pauseIndex + 5, lines.length); j++) {
    const match = /^--\s*Answer:\s*(.+?)\s*--\s*$/.exec(lines[j]!.trim());
    if (match) {
      return match[1]!.trim();
    }
  }
  return null;
}

/**
 * Calculate silence duration based on expected answer word count.
 *
 * Formula: 2.5 + (word_count * 0.6), clamped to [3.0, 8.0] seconds.
 */
export function calculatePauseDuration(answerText: string): number {
  const wordCount = answerText.split(/\s+/).filter((w) => w.length > 0).length;
  const duration = 2.5 + wordCount * 0.6;
  return Math.max(3.0, Math.min(duration, 8.0));
}

/**
 * Parse lesson transcript into an ordered list of typed segments.
 *
 * Returns segments of type "speak" or "pause":
 *   { type: "speak", text: "..." }
 *   { type: "pause", duration_seconds: 3.0 }
 *
 * The flow at each {{PAUSE}} is:
 *   1. All narrator text before it -> speak segments
 *   2. The pause -> pause segment (silence for learner to speak)
 *   3. The answer text -> speak segment (correct answer revealed)
 */
export function parseToSegments(lessonContent: string): Segment[] {
  const lines = normalizePauses(lessonContent).split("\n");
  const segments: Segment[] = [];
  let i = 0;

  while (i < lines.length) {
    const stripped = lines[i]!.trim();

    if (stripped.includes("{{PAUSE}}")) {
      const answerText = findAnswerText(lines, i);

      if (answerText) {
        const duration = calculatePauseDuration(answerText);
        segments.push({ type: "pause", duration_seconds: duration });
        segments.push({ type: "speak", text: answerText });
        // Brief pause after the answer so the next line doesn't run on
        segments.push({ type: "pause", duration_seconds: 2.0 });
      } else {
        // PAUSE without answer -- insert a default 3s pause
        segments.push({ type: "pause", duration_seconds: 3.0 });
      }

      i += 1;
      continue;
    }

    if (isSkippable(stripped)) {
      i += 1;
      continue;
    }

    // Spoken line -- clean and add as speak segment
    const spoken = cleanSpokenText(stripped);
    if (spoken) {
      segments.push({ type: "speak", text: spoken });
    }

    i += 1;
  }

  return segments;
}

/**
 * Parse expected answers from lesson transcript.
 *
 * Pattern: {{PAUSE}} followed by -- Answer: <answer> --
 * Returns list of {turn_index, expected_answer, prompt_text}.
 */
export function parseExpectedAnswers(lessonContent: string): ExpectedAnswer[] {
  const answers: ExpectedAnswer[] = [];
  const lines = normalizePauses(lessonContent).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("{{PAUSE}}")) {
      const answerText = findAnswerText(lines, i);
      if (answerText) {
        // Get the prompt (narrator text before the PAUSE)
        let prompt = "";
        for (let k = i - 1; k > Math.max(i - 10, -1); k--) {
          if (lines[k]!.trim()) {
            prompt = lines[k]!.trim();
            prompt = prompt.replace(/^\[.*?\]\s*/, "");
            break;
          }
        }
        answers.push({
          turn_index: answers.length,
          expected_answer: answerText,
          prompt_text: prompt,
        });
      }
    }
  }
  return answers;
}

/**
 * Estimate timestamps for each {{PAUSE}} in the lesson.
 *
 * Walks through the lesson line by line, accumulating time from spoken
 * characters, pause silence, and answer speaking. This accounts for the
 * actual audio structure: narrator -> silence -> answer spoken.
 * Returns list of {turn_index, estimated_seconds}.
 *
 * Uses 15 chars/sec to match ssml_builder._CHARS_PER_SECOND and actual
 * Azure TTS output rate.
 */
export function estimateTimestamps(
  lessonContent: string,
  charsPerSecond = 15.0,
): Timestamp[] {
  const timestamps: Timestamp[] = [];
  let cumulativeSeconds = 0.0;
  let turnIndex = 0;
  const lines = normalizePauses(lessonContent).split("\n");

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i]!.trim();
    if (stripped.includes("{{PAUSE}}")) {
      // Record timestamp at the start of this pause
      timestamps.push({
        turn_index: turnIndex,
        estimated_seconds: Math.round(cumulativeSeconds * 10) / 10,
      });

      const answerText = findAnswerText(lines, i);
      if (answerText) {
        const pauseDuration = calculatePauseDuration(answerText);
        const answerSpeakingTime = answerText.length / charsPerSecond;
        cumulativeSeconds += pauseDuration + answerSpeakingTime;
      } else {
        cumulativeSeconds += 3.0; // default pause
      }

      turnIndex += 1;
    } else if (isSkippable(stripped)) {
      continue;
    } else {
      // Count spoken characters
      const spoken = cleanSpokenText(stripped);
      cumulativeSeconds += spoken.length / charsPerSecond;
    }
  }

  return timestamps;
}

/**
 * Strip non-spoken content from lesson transcript for TTS input.
 *
 * Removes {{PAUSE}} markers, -- Answer: ... -- lines, section headers,
 * speaker label prefixes, and markdown formatting. Keeps only clean
 * spoken text suitable for TTS models.
 *
 * Note: This produces a flat text stream with no pauses. For pause-aware
 * audio generation, use parseToSegments() instead.
 */
export function stripToSpokenScript(lessonContent: string): string {
  const lines = normalizePauses(lessonContent).split("\n");
  const spokenLines: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (isSkippable(stripped)) continue;
    const spoken = cleanSpokenText(stripped);
    if (spoken) spokenLines.push(spoken);
  }

  return spokenLines.join("\n");
}
