"""Review Agent — checks user translations and reports a diff."""

import difflib
import re
import unicodedata
from typing import List, Dict, Any


_EDGE_PUNCT_RE = re.compile(r"^[\s\.,;:!?\"']+|[\s\.,;:!?\"']+$")
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize(s: str) -> str:
    """Casefold, strip diacritics and surrounding punctuation, collapse spaces."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.casefold().strip()
    s = _EDGE_PUNCT_RE.sub("", s)
    s = _WHITESPACE_RE.sub(" ", s)
    return s


class ReviewAgent:
    CLOSE_THRESHOLD = 0.85

    def check_translation(self, user_input: str, expected: str) -> Dict[str, Any]:
        u_norm = _normalize(user_input or "")
        e_norm = _normalize(expected or "")
        is_correct = bool(u_norm) and u_norm == e_norm
        ratio = difflib.SequenceMatcher(None, u_norm, e_norm).ratio() if u_norm else 0.0
        close = (not is_correct) and ratio >= self.CLOSE_THRESHOLD
        return {
            "correct": is_correct,
            "close": close,
            "ratio": round(ratio, 3),
            "expected": expected,
            "user_input": user_input,
            "diff": self.diff_words(user_input or "", expected or ""),
        }

    def diff_words(self, a: str, b: str) -> List[str]:
        a_tokens = a.split()
        b_tokens = b.split()
        return [tok for tok in difflib.ndiff(a_tokens, b_tokens) if tok.strip()]
