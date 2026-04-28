import pytest

from validators.llm_validator import (
    LLMValidationError,
    enforce_vocab,
    extract_json,
    validate_topic_content,
    validate_topics,
)


# -- extract_json ------------------------------------------------------------


def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_strips_json_fence():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_extract_json_strips_bare_fence():
    assert extract_json('```\n[1, 2]\n```') == [1, 2]


def test_extract_json_invalid_raises():
    with pytest.raises(LLMValidationError, match="not valid JSON"):
        extract_json("not json at all")


def test_extract_json_none_raises():
    with pytest.raises(LLMValidationError, match="Empty"):
        extract_json(None)


# -- validate_topics ---------------------------------------------------------


def test_validate_topics_ok():
    out = validate_topics([
        {"topic": "Phonology", "description": "x"},
        {"topic": "Syntax", "description": "y"},
    ])
    assert len(out) == 2
    assert out[0]["topic"] == "Phonology"


def test_validate_topics_dedupes_case_insensitive():
    out = validate_topics([
        {"topic": "Phonology", "description": "x"},
        {"topic": "phonology", "description": "duplicate"},
    ])
    assert len(out) == 1


def test_validate_topics_not_list_raises():
    with pytest.raises(LLMValidationError, match="JSON array"):
        validate_topics({"not": "a list"})


def test_validate_topics_empty_raises():
    with pytest.raises(LLMValidationError, match="empty"):
        validate_topics([])


def test_validate_topics_missing_field_raises():
    with pytest.raises(LLMValidationError, match="missing"):
        validate_topics([{"topic": "X"}])


# -- validate_topic_content --------------------------------------------------


def _ok_content(n_sentences=10):
    return {
        "rule": "the rule",
        "scheme": "S + V + O",
        "sentences": [f"sentence {i}" for i in range(n_sentences)],
    }


def test_validate_topic_content_ok():
    out = validate_topic_content(_ok_content())
    assert out["rule"] == "the rule"
    assert len(out["sentences"]) == 10


def test_validate_topic_content_wrong_sentence_count_raises():
    with pytest.raises(LLMValidationError, match="10 sentences"):
        validate_topic_content(_ok_content(n_sentences=9))


def test_validate_topic_content_missing_field_raises():
    bad = _ok_content()
    del bad["rule"]
    with pytest.raises(LLMValidationError, match="rule"):
        validate_topic_content(bad)


def test_validate_topic_content_empty_sentence_raises():
    bad = _ok_content()
    bad["sentences"][3] = "   "
    with pytest.raises(LLMValidationError, match="Sentence #3"):
        validate_topic_content(bad)


# -- enforce_vocab -----------------------------------------------------------


def test_enforce_vocab_pairs_ok():
    sentences = ["I love hola today", "He uses adios often"] + [
        "Then gracias arrives" for _ in range(8)
    ]
    enforce_vocab(sentences, [("hola", "hello"), ("adios", "goodbye"), ("gracias", "thanks")])


def test_enforce_vocab_translation_match_ok():
    # native-language match should also satisfy enforcement
    enforce_vocab(["I say hello today"] * 10, [("hola", "hello")])


def test_enforce_vocab_missing_raises():
    with pytest.raises(LLMValidationError, match="Sentence #0"):
        enforce_vocab(["totally unrelated"] * 10, [("hola", "hello")])


def test_enforce_vocab_word_boundary_required():
    # 'hola' should NOT match inside 'cholate'
    with pytest.raises(LLMValidationError):
        enforce_vocab(["cholate forever"] * 10, [("hola", "hello")])


def test_enforce_vocab_empty_vocab_is_noop():
    enforce_vocab(["anything"], [])


def test_enforce_vocab_string_list_form():
    enforce_vocab(["I see hola"] * 10, ["hola"])
