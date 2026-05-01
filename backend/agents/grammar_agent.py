"""Grammar Agent — LLM core. Generates topics and topic content with retries."""

from typing import List, Dict, Any, Tuple, Union

from llm.client import LLMClient
from llm.prompts import (
    PHILOLOGY_TOPICS_PROMPT,
    TOPIC_CONTENT_PROMPT,
    WORD_SENTENCES_PROMPT,
    STRICTER_PREFIX,
)
from validators.llm_validator import (
    extract_json,
    validate_topics,
    validate_topic_content,
    enforce_vocab,
    LLMValidationError,
)


VocabPair = Tuple[str, str]
VocabInput = List[Union[str, VocabPair]]


def _format_vocab(vocab: VocabInput) -> str:
    """Format the vocabulary list for the prompt as 'word (translation), …'."""
    parts = []
    for entry in vocab:
        if isinstance(entry, tuple) and len(entry) == 2:
            word, translation = entry
            parts.append(f"{word} ({translation})")
        else:
            parts.append(str(entry))
    return ", ".join(parts)


class GrammarAgent:
    def __init__(self, llm_client: LLMClient):
        self.llm = llm_client

    def generate_philology_topics(
        self, language: str, level: str = "advanced", retries: int = 2
    ) -> List[Dict[str, str]]:
        prompt = PHILOLOGY_TOPICS_PROMPT.format(language=language, level=level)
        last_error: Exception = LLMValidationError("no attempts run")
        for attempt in range(retries + 1):
            try:
                raw = self.llm.complete(prompt, max_tokens=4000)
                parsed = extract_json(raw)
                return validate_topics(parsed)
            except LLMValidationError as e:
                last_error = e
                prompt = STRICTER_PREFIX + PHILOLOGY_TOPICS_PROMPT.format(
                    language=language, level=level
                )
        raise last_error

    def generate_word_sentences(
        self, language: str, word: str, count: int = 3, retries: int = 2
    ) -> List[str]:
        """Ask the LLM for `count` short example sentences featuring `word`.

        Returns a plain list of strings. The LLM responds in JSON
        ``{"sentences": [...]}``; we extract the array and validate that we
        got the requested number of non-empty entries.
        """
        prompt = WORD_SENTENCES_PROMPT.format(language=language, word=word, count=count)
        last_error: Exception = LLMValidationError("no attempts run")
        for _ in range(retries + 1):
            try:
                raw = self.llm.complete(prompt, max_tokens=1500)
                parsed = extract_json(raw)
                if not isinstance(parsed, dict) or not isinstance(parsed.get("sentences"), list):
                    raise LLMValidationError("Expected an object with a 'sentences' array.")
                sentences = [s.strip() for s in parsed["sentences"] if isinstance(s, str) and s.strip()]
                if len(sentences) < count:
                    raise LLMValidationError(
                        f"Expected {count} sentences, got {len(sentences)}."
                    )
                return sentences[:count]
            except LLMValidationError as e:
                last_error = e
                prompt = STRICTER_PREFIX + WORD_SENTENCES_PROMPT.format(
                    language=language, word=word, count=count
                )
        raise last_error

    def generate_topic_content(
        self,
        language: str,
        topic: str,
        vocabulary: VocabInput,
        retries: int = 2,
    ) -> Dict[str, Any]:
        vocab_text = _format_vocab(vocabulary)
        prompt = TOPIC_CONTENT_PROMPT.format(
            language=language, topic=topic, vocabulary_list=vocab_text
        )
        last_error: Exception = LLMValidationError("no attempts run")
        for attempt in range(retries + 1):
            try:
                raw = self.llm.complete(prompt, max_tokens=4000)
                parsed = extract_json(raw)
                content = validate_topic_content(parsed)
                enforce_vocab(content["sentences"], vocabulary)
                return content
            except LLMValidationError as e:
                last_error = e
                prompt = STRICTER_PREFIX + TOPIC_CONTENT_PROMPT.format(
                    language=language, topic=topic, vocabulary_list=vocab_text
                )
        raise last_error
