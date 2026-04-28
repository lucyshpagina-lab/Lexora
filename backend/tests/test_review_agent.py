from agents.review_agent import ReviewAgent, _normalize


def test_normalize_strips_diacritics_and_punctuation():
    assert _normalize("  Adiós!! ") == "adios"


def test_normalize_collapses_spaces_and_casefolds():
    assert _normalize("HOLA   amigo") == "hola amigo"


def test_check_translation_correct():
    r = ReviewAgent().check_translation("Hello", "hello")
    assert r["correct"] is True
    assert r["close"] is False
    assert r["ratio"] == 1.0


def test_check_translation_correct_with_diacritics():
    r = ReviewAgent().check_translation("adios", "adiós")
    assert r["correct"] is True


def test_check_translation_close():
    # ratio between "helllo" and "hello" should be ≥ 0.85
    r = ReviewAgent().check_translation("helllo", "hello")
    assert r["correct"] is False
    assert r["close"] is True
    assert r["ratio"] >= 0.85


def test_check_translation_incorrect():
    r = ReviewAgent().check_translation("apple", "house")
    assert r["correct"] is False
    assert r["close"] is False


def test_check_translation_empty_input():
    r = ReviewAgent().check_translation("", "hello")
    assert r["correct"] is False
    assert r["close"] is False
    assert r["ratio"] == 0.0


def test_check_translation_includes_diff():
    r = ReviewAgent().check_translation("hello world", "goodbye world")
    assert isinstance(r["diff"], list)
    # diff contains tokens with leading +/-/? markers
    assert any(tok.startswith("- ") or tok.startswith("+ ") for tok in r["diff"])


def test_diff_words_filters_blank_tokens():
    diffs = ReviewAgent().diff_words("a b", "a c")
    assert all(tok.strip() for tok in diffs)
