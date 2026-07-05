from yapzee_common.lesson_parser import (
    CHARS_PER_SECOND,
    ELLIPSIS_RE,
    ES_TAG_RE,
    _clean_spoken_text,
    calculate_pause_duration,
    clean_spoken_text,
)


def test_constants_exist():
    assert CHARS_PER_SECOND == 15
    assert ELLIPSIS_RE.match("...")


def test_es_tag_re_matches():
    match = ES_TAG_RE.search("<es>hola</es>")
    assert match is not None
    assert match.group(1) == "hola"


def test_clean_spoken_text_alias_matches_public():
    text = "[Narrator] **hola** _mundo_"
    assert _clean_spoken_text(text) == clean_spoken_text(text)


def test_pause_formula_midrange():
    # 2.5 + 0.6 * word_count, clamped to [3, 8]
    answer_text = " ".join(["palabra"] * 5)
    assert calculate_pause_duration(answer_text) == 2.5 + 0.6 * 5


def test_pause_clamps_low():
    assert calculate_pause_duration("") == 3.0


def test_pause_clamps_high():
    answer_text = " ".join(["palabra"] * 50)
    assert calculate_pause_duration(answer_text) == 8.0
