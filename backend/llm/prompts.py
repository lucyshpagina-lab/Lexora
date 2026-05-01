"""LLM prompts for the Grammar Agent. Kept verbatim from the spec."""

PHILOLOGY_TOPICS_PROMPT = """You are a linguistics expert.

Task:
Generate a COMPLETE and structured list of grammar topics for the language: {language}, level: {level}.

Requirements:
- include ALL relevant grammar categories
- include advanced syntax
- include stylistics
- include discourse-level structures
- avoid duplicates
- group logically

Output format (STRICT JSON):
[
  {{
    "topic": "...",
    "description": "..."
  }}
]

Do NOT:
- simplify
- omit advanced topics
- invent non-existent structures

Return ONLY the JSON array. No prose, no markdown fences.
"""


TOPIC_CONTENT_PROMPT = """You are a linguistics teacher.

Task:
Generate learning material for:

Language: {language}
Topic: {topic}
Vocabulary: {vocabulary_list}

Requirements:

1. Rule Explanation
- clear but accurate
- no unnecessary theory

2. Structure Scheme
- formula-like

3. Exercises:
- 10 sentences in native language
- MUST use provided vocabulary
- MUST reflect the grammar topic

Output (STRICT JSON):
{{
  "rule": "...",
  "scheme": "...",
  "sentences": ["...", "..."]
}}

Return EXACTLY 10 sentences. Return ONLY the JSON object. No prose, no markdown fences.
"""


WORD_SENTENCES_PROMPT = """You are a language tutor.

Task:
Produce {count} short example sentences in {language} that USE the word "{word}" naturally.
Each sentence must:
- contain the word "{word}" at least once
- be 6 to 14 words long
- be grammatically correct and natural

Output (STRICT JSON):
{{
  "sentences": ["...", "..."]
}}

Return ONLY the JSON object. No prose, no markdown fences.
"""


STRICTER_PREFIX = (
    "Your previous response was rejected because the JSON was invalid or incomplete. "
    "Return ONLY a single JSON value matching the schema. No prose, no code fences, no comments. "
    "Use exact field names and exact counts.\n\n"
)
