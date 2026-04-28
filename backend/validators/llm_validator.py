"""Strict post-validation for LLM JSON output, plus vocab enforcement."""

import json
import re
from typing import Any, List


class LLMValidationError(ValueError):
    pass


def extract_json(text: str) -> Any:
    """Parse LLM output as JSON, tolerating fenced code blocks."""
    if text is None:
        raise LLMValidationError("Empty LLM response.")
    cleaned = text.strip()
    # Strip ```json ... ``` fences if present.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise LLMValidationError(f"Response is not valid JSON: {e}") from e


def validate_topics(data: Any) -> List[dict]:
    if not isinstance(data, list):
        raise LLMValidationError("Topics payload must be a JSON array.")
    if not data:
        raise LLMValidationError("Topics list is empty.")
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise LLMValidationError(f"Topic #{i} is not an object.")
        if "topic" not in item or not isinstance(item["topic"], str) or not item["topic"].strip():
            raise LLMValidationError(f"Topic #{i} missing 'topic'.")
        if "description" not in item or not isinstance(item["description"], str):
            raise LLMValidationError(f"Topic #{i} missing 'description'.")
    # de-duplicate by topic
    seen = set()
    unique = []
    for item in data:
        key = item["topic"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append({"topic": item["topic"].strip(), "description": item["description"].strip()})
    return unique


def validate_topic_content(data: Any) -> dict:
    if not isinstance(data, dict):
        raise LLMValidationError("Topic content must be a JSON object.")
    for field in ("rule", "scheme", "sentences"):
        if field not in data:
            raise LLMValidationError(f"Missing required field '{field}'.")
    if not isinstance(data["rule"], str) or not data["rule"].strip():
        raise LLMValidationError("Field 'rule' must be a non-empty string.")
    if not isinstance(data["scheme"], str) or not data["scheme"].strip():
        raise LLMValidationError("Field 'scheme' must be a non-empty string.")
    if not isinstance(data["sentences"], list):
        raise LLMValidationError("Field 'sentences' must be a list.")
    if len(data["sentences"]) != 10:
        raise LLMValidationError(
            f"Expected exactly 10 sentences, got {len(data['sentences'])}."
        )
    for i, s in enumerate(data["sentences"]):
        if not isinstance(s, str) or not s.strip():
            raise LLMValidationError(f"Sentence #{i} is empty or not a string.")
    return {
        "rule": data["rule"].strip(),
        "scheme": data["scheme"].strip(),
        "sentences": [s.strip() for s in data["sentences"]],
    }


def enforce_vocab(sentences: List[str], vocab) -> None:
    """Each sentence must use at least one vocabulary item.

    Vocabulary may be a list of strings OR a list of (word, translation)
    pairs. Either form (target word or native translation) is accepted —
    sentences are typically in the native language but may embed
    target-language words inline.
    """
    if not vocab:
        return
    needles: List[str] = []
    for entry in vocab:
        if isinstance(entry, (tuple, list)) and len(entry) == 2:
            for token in entry:
                if isinstance(token, str) and token.strip():
                    needles.append(token.strip().lower())
        elif isinstance(entry, str) and entry.strip():
            needles.append(entry.strip().lower())
    if not needles:
        return
    patterns = [re.compile(rf"\b{re.escape(n)}\b") for n in needles]
    for i, sentence in enumerate(sentences):
        haystack = sentence.lower()
        if not any(p.search(haystack) for p in patterns):
            raise LLMValidationError(
                f"Sentence #{i} does not use any of the supplied vocabulary."
            )
