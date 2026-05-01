"""Deterministic fallback when ANTHROPIC_API_KEY is not configured.

Lets the rest of the app function (and demo) without a live LLM call.
The real prompts still flow through the validation/retry path.
"""

import json
import re


_TOPICS = [
    {"topic": "Phonology and Phonetics", "description": "Sound system, allophonic variation, prosody, intonation contours."},
    {"topic": "Morphology — Inflection", "description": "Paradigms for nouns, verbs, adjectives; agreement features."},
    {"topic": "Morphology — Derivation", "description": "Affixation, compounding, productive vs unproductive patterns."},
    {"topic": "Nominal Categories", "description": "Gender, number, case, definiteness; their morphosyntactic interaction."},
    {"topic": "Verbal Categories", "description": "Tense, aspect, mood, voice, evidentiality, polarity."},
    {"topic": "Argument Structure", "description": "Valency, transitivity, ditransitives, applicatives, causatives."},
    {"topic": "Clause Structure and Word Order", "description": "Constituency, phrase structure, basic and marked orders."},
    {"topic": "Subordination and Coordination", "description": "Complement clauses, relative clauses, adverbial clauses, parataxis."},
    {"topic": "Information Structure", "description": "Topic, focus, given/new, contrast; cleft and pseudo-cleft constructions."},
    {"topic": "Negation and Polarity", "description": "Sentential vs constituent negation, negative concord, NPIs."},
    {"topic": "Modality and Evidentiality", "description": "Epistemic, deontic, dynamic modality; evidential marking."},
    {"topic": "Tense–Aspect Semantics", "description": "Perfective/imperfective, perfect, progressive, habitual; sequence of tenses."},
    {"topic": "Pragmatics and Speech Acts", "description": "Illocution, implicature, presupposition, politeness strategies."},
    {"topic": "Discourse Structure", "description": "Cohesion, coherence, rhetorical relations, anaphora resolution."},
    {"topic": "Stylistics and Register", "description": "Formal/informal registers, literary devices, genre conventions."},
]


def _topics_response() -> str:
    return json.dumps(_TOPICS, ensure_ascii=False)


def _topic_content_response(prompt: str) -> str:
    # Pull vocabulary out of the prompt so generated sentences actually use it.
    # Format from the orchestrator is "word (translation), word (translation), …".
    vocab_match = re.search(r"Vocabulary:\s*(.+)", prompt)
    pairs: list[tuple[str, str]] = []
    if vocab_match:
        for chunk in vocab_match.group(1).split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            m = re.match(r"^(.+?)\s*\((.+)\)\s*$", chunk)
            if m:
                pairs.append((m.group(1).strip(), m.group(2).strip()))
            else:
                pairs.append((chunk, chunk))
    if not pairs:
        pairs = [("word", "word")]

    topic_match = re.search(r"Topic:\s*(.+)", prompt)
    topic = topic_match.group(1).strip() if topic_match else "the topic"

    sentences = []
    for i in range(10):
        word, translation = pairs[i % len(pairs)]
        sentences.append(
            f"Translate to practice {topic}: I will use the {translation} ({word}) tomorrow."
        )

    payload = {
        "rule": (
            f"This exercise targets {topic}. The mock LLM is active because "
            "ANTHROPIC_API_KEY is not set — set it to receive a real linguistic explanation."
        ),
        "scheme": "[SUBJECT] + [VERB-target-form] + [OBJECT/COMPLEMENT]",
        "sentences": sentences,
    }
    return json.dumps(payload, ensure_ascii=False)


def _word_sentences_response(prompt: str) -> str:
    word_match = re.search(r'USE the word "([^"]+)"', prompt)
    word = word_match.group(1) if word_match else "word"
    count_match = re.search(r"Produce (\d+) short example sentences", prompt)
    count = int(count_match.group(1)) if count_match else 3
    sentences = [
        f"They learned how to use {word} in a friendly conversation today.",
        f"My teacher wrote {word} on the board and explained the meaning.",
        f"I will remember the word {word} when I travel next month.",
        f"Could you spell {word} for me one more time, please?",
        f"The little child repeated {word} until everyone laughed kindly.",
    ][:count]
    return json.dumps({"sentences": sentences}, ensure_ascii=False)


def mock_response(prompt: str) -> str:
    if "Generate a COMPLETE and structured list of grammar topics" in prompt:
        return _topics_response()
    if "Generate learning material for" in prompt:
        return _topic_content_response(prompt)
    if "Produce" in prompt and "short example sentences" in prompt:
        return _word_sentences_response(prompt)
    return "{}"
