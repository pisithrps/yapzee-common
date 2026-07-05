import { describe, expect, test } from "bun:test";
import {
  CHARS_PER_SECOND,
  ELLIPSIS_RE,
  ES_TAG_RE,
  calculatePauseDuration,
  cleanSpokenText,
  parseExpectedAnswers,
  parseToSegments,
} from "../src/lessonParser.js";

describe("lessonParser constants", () => {
  test("constants exist", () => {
    expect(CHARS_PER_SECOND).toBe(15);
    expect(ELLIPSIS_RE.test("...")).toBe(true);
  });

  test("ES_TAG_RE matches", () => {
    const match = ES_TAG_RE.exec("<es>hola</es>");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("hola");
  });
});

describe("cleanSpokenText", () => {
  test("strips speaker label + markdown emphasis", () => {
    expect(cleanSpokenText("[Narrator] **hola** _mundo_")).toBe("hola mundo");
  });
});

describe("calculatePauseDuration", () => {
  test("mid-range formula", () => {
    const answerText = new Array(5).fill("palabra").join(" ");
    expect(calculatePauseDuration(answerText)).toBe(2.5 + 0.6 * 5);
  });

  test("clamps low", () => {
    expect(calculatePauseDuration("")).toBe(3.0);
  });

  test("clamps high", () => {
    const answerText = new Array(50).fill("palabra").join(" ");
    expect(calculatePauseDuration(answerText)).toBe(8.0);
  });
});

describe("segment/answer parsing on a sample transcript", () => {
  const transcript = [
    "[Narrator] ¿Cómo se dice hello?",
    "{{PAUSE}}",
    "-- Answer: hola --",
  ].join("\n");

  test("parseToSegments produces speak/pause/speak/pause", () => {
    const segments = parseToSegments(transcript);
    expect(segments).toEqual([
      { type: "speak", text: "¿Cómo se dice hello?" },
      { type: "pause", duration_seconds: 2.5 + 0.6 * 1 },
      { type: "speak", text: "hola" },
      { type: "pause", duration_seconds: 2.0 },
    ]);
  });

  test("parseExpectedAnswers extracts prompt + answer", () => {
    const answers = parseExpectedAnswers(transcript);
    expect(answers).toEqual([
      { turn_index: 0, expected_answer: "hola", prompt_text: "¿Cómo se dice hello?" },
    ]);
  });
});
