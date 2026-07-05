"""Shared lesson transcript parsing utilities.

Used by the lesson/content pipeline and the podcast TTS pipeline to extract
expected answers and timing information from lesson markdown files.
"""

import re

# Approximate speaking rate: ~150 words per minute → 2.5 words/sec.
# Average word length ~5 chars + space → ~15 chars/sec.
# Mirrors the backend's ssml_builder._CHARS_PER_SECOND (Azure TTS rate).
CHARS_PER_SECOND = 15

ES_TAG_RE = re.compile(r"<es>(.*?)</es>", re.DOTALL)
ELLIPSIS_RE = re.compile(r'^[\s.…]+$')


def clean_spoken_text(text: str) -> str:
    """Clean a line of lesson text into speakable prose."""
    # Strip speaker labels but keep the text
    text = re.sub(r"^\[.*?\]\s*", "", text)
    # Strip bullet point markers
    text = re.sub(r"^[-*+]\s+", "", text)
    # Strip markdown emphasis (bold/italic asterisks and underscores)
    text = re.sub(r"\*{1,2}(.+?)\*{1,2}", r"\1", text)
    text = re.sub(r"_{1,2}(.+?)_{1,2}", r"\1", text)
    return text


def is_skippable(stripped: str) -> bool:
    """Check if a line is non-spoken content that should be skipped."""
    if not stripped:
        return True
    if "{{PAUSE}}" in stripped:
        return True
    if re.match(r"^--\s*Answer:.*--\s*$", stripped):
        return True
    if re.match(r"^--\s*.+\s*--\s*$", stripped):
        return True
    if stripped.startswith("#"):
        return True
    return False


def _normalize_pauses(content: str) -> str:
    """Normalize common pause marker variants to the canonical {{PAUSE}}.

    LLMs sometimes output <pause>, <speak>, [pause], (pause), empty code
    fences, or omit the pause marker entirely before `-- Answer:` lines.
    This safety net ensures the downstream pipeline always sees {{PAUSE}}.
    Also strips syllable-break hyphens inside <es> tags that corrupt TTS.
    """
    # Pass 1: replace known pause variants with {{PAUSE}}
    content = re.sub(
        r"<(?:pause|speak)\s*/?>|\[pause\]|\(pause\)",
        "{{PAUSE}}", content, flags=re.IGNORECASE,
    )
    content = re.sub(r"^`{2,3}\s*$", "{{PAUSE}}", content, flags=re.MULTILINE)

    # Pass 2: strip syllable-break hyphens inside <es> tags.
    # "per-do-na" → "perdona", "a-yu-dar" → "ayudar"
    # Only removes hyphens surrounded by letters (not "—" em-dashes or
    # hyphens in answer-line markers like "-- Answer:").
    def _strip_syllable_hyphens(m: re.Match) -> str:
        inner = re.sub(r"(?<=[a-záéíóúüñA-ZÁÉÍÓÚÜÑ])-(?=[a-záéíóúüñA-ZÁÉÍÓÚÜÑ])", "", m.group(1))
        return f"<es>{inner}</es>"
    content = re.sub(r"<es>(.*?)</es>", _strip_syllable_hyphens, content, flags=re.DOTALL)

    # Pass 3: inject {{PAUSE}} before any -- Answer: line that doesn't
    # already have one in the preceding 3 lines.
    lines = content.split("\n")
    result: list[str] = []
    for line in lines:
        stripped = line.strip()
        if re.match(r"^--\s*Answer:", stripped):
            # Look back up to 3 lines for an existing {{PAUSE}}
            has_pause = any(
                "{{PAUSE}}" in result[j]
                for j in range(max(0, len(result) - 3), len(result))
            )
            if not has_pause:
                result.append("{{PAUSE}}")
        result.append(line)

    return "\n".join(result)


def find_answer_text(lines: list[str], pause_index: int) -> str | None:
    """Find the answer text in the -- Answer: ... -- line after a {{PAUSE}}."""
    for j in range(pause_index + 1, min(pause_index + 5, len(lines))):
        match = re.match(r"^--\s*Answer:\s*(.+?)\s*--\s*$", lines[j].strip())
        if match:
            return match.group(1).strip()
    return None


# Underscore aliases preserved for one release so mid-bump consumers don't break.
_clean_spoken_text = clean_spoken_text
_find_answer_text = find_answer_text
_is_skippable = is_skippable


def calculate_pause_duration(answer_text: str) -> float:
    """Calculate silence duration based on expected answer word count.

    Formula: 2.5 + (word_count * 0.6), clamped to [3.0, 8.0] seconds.
    """
    word_count = len(answer_text.split())
    duration = 2.5 + (word_count * 0.6)
    return max(3.0, min(duration, 8.0))


def parse_to_segments(lesson_content: str) -> list[dict]:
    """Parse lesson transcript into an ordered list of typed segments.

    Returns segments of type "speak" or "pause":
      {"type": "speak", "text": "..."}
      {"type": "pause", "duration_seconds": 3.0}

    The flow at each {{PAUSE}} is:
      1. All narrator text before it -> speak segments
      2. The pause -> pause segment (silence for learner to speak)
      3. The answer text -> speak segment (correct answer revealed)
    """
    lines = _normalize_pauses(lesson_content).split("\n")
    segments = []
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()

        if "{{PAUSE}}" in stripped:
            answer_text = find_answer_text(lines, i)

            if answer_text:
                duration = calculate_pause_duration(answer_text)
                segments.append({"type": "pause", "duration_seconds": duration})
                segments.append({"type": "speak", "text": answer_text})
                # Brief pause after the answer so the next line doesn't run on
                segments.append({"type": "pause", "duration_seconds": 2.0})
            else:
                # PAUSE without answer — insert a default 3s pause
                segments.append({"type": "pause", "duration_seconds": 3.0})

            i += 1
            continue

        if is_skippable(stripped):
            i += 1
            continue

        # Spoken line — clean and add as speak segment
        spoken = clean_spoken_text(stripped)
        if spoken:
            segments.append({"type": "speak", "text": spoken})

        i += 1

    return segments


def parse_expected_answers(lesson_content: str) -> list[dict]:
    """Parse expected answers from lesson transcript.

    Pattern: {{PAUSE}} followed by -- Answer: <answer> --
    Returns list of {turn_index, expected_answer, prompt_text}.
    """
    answers = []
    lines = _normalize_pauses(lesson_content).split("\n")
    for i, line in enumerate(lines):
        if "{{PAUSE}}" in line:
            answer_text = find_answer_text(lines, i)
            if answer_text:
                # Get the prompt (narrator text before the PAUSE)
                prompt = ""
                for k in range(i - 1, max(i - 10, -1), -1):
                    if lines[k].strip():
                        prompt = lines[k].strip()
                        prompt = re.sub(r"^\[.*?\]\s*", "", prompt)
                        break
                answers.append({
                    "turn_index": len(answers),
                    "expected_answer": answer_text,
                    "prompt_text": prompt,
                })
    return answers


def estimate_timestamps(lesson_content: str, chars_per_second: float = 15.0) -> list[dict]:
    """Estimate timestamps for each {{PAUSE}} in the lesson.

    Walks through the lesson line by line, accumulating time from spoken
    characters, pause silence, and answer speaking. This accounts for the
    actual audio structure: narrator -> silence -> answer spoken.
    Returns list of {turn_index, estimated_seconds}.

    Uses 15 chars/sec to match ssml_builder._CHARS_PER_SECOND and actual
    Azure TTS output rate.
    """

    timestamps = []
    cumulative_seconds = 0.0
    turn_index = 0
    lines = _normalize_pauses(lesson_content).split("\n")

    for i, line in enumerate(lines):
        stripped = line.strip()
        if "{{PAUSE}}" in stripped:
            # Record timestamp at the start of this pause
            timestamps.append({
                "turn_index": turn_index,
                "estimated_seconds": round(cumulative_seconds, 1),
            })

            answer_text = find_answer_text(lines, i)
            if answer_text:
                pause_duration = calculate_pause_duration(answer_text)
                answer_speaking_time = len(answer_text) / chars_per_second
                cumulative_seconds += pause_duration + answer_speaking_time
            else:
                cumulative_seconds += 3.0  # default pause

            turn_index += 1
        elif is_skippable(stripped):
            continue
        else:
            # Count spoken characters
            spoken = clean_spoken_text(stripped)
            cumulative_seconds += len(spoken) / chars_per_second

    return timestamps


def strip_to_spoken_script(lesson_content: str) -> str:
    """Strip non-spoken content from lesson transcript for TTS input.

    Removes {{PAUSE}} markers, -- Answer: ... -- lines, section headers,
    speaker label prefixes, and markdown formatting. Keeps only clean
    spoken text suitable for TTS models.

    Note: This produces a flat text stream with no pauses. For pause-aware
    audio generation, use parse_to_segments() instead.
    """
    lines = _normalize_pauses(lesson_content).split("\n")
    spoken_lines = []

    for line in lines:
        stripped = line.strip()
        if is_skippable(stripped):
            continue
        spoken = clean_spoken_text(stripped)
        if spoken:
            spoken_lines.append(spoken)

    return "\n".join(spoken_lines)
