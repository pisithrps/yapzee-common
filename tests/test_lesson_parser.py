from yapzee_common.lesson_parser import calculate_pause_duration


def test_pause_formula_midrange():
    # 2.5 + 0.6 * word_count, clamped to [3, 8]
    answer_text = " ".join(["palabra"] * 5)
    assert calculate_pause_duration(answer_text) == 2.5 + 0.6 * 5


def test_pause_clamps_low():
    assert calculate_pause_duration("") == 3.0


def test_pause_clamps_high():
    answer_text = " ".join(["palabra"] * 50)
    assert calculate_pause_duration(answer_text) == 8.0
