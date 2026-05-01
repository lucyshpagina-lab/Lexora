"""Learning Orchestrator — main agent. Routes user actions to subagents."""

import secrets
from typing import Any, Dict, List, Optional

from agents.file_agent import FileAgent
from agents.vocab_agent import VocabAgent
from agents.review_agent import ReviewAgent
from agents.grammar_agent import GrammarAgent
from agents.progress_agent import ProgressAgent
from llm.client import LLMClient
from services.storage import Storage


class Orchestrator:
    def __init__(self, storage: Optional[Storage] = None):
        self.storage = storage or Storage()
        self.llm = LLMClient()
        self.file_agent = FileAgent()
        self.vocab_agent = VocabAgent(self.storage)
        self.review_agent = ReviewAgent()
        self.grammar_agent = GrammarAgent(self.llm)
        self.progress_agent = ProgressAgent(self.storage)

    # -- File flow ---------------------------------------------------------

    def _build_session(
        self,
        words: List[Dict[str, str]],
        native_language: str,
        target_language: str,
        source: str,
        user_id: Optional[str] = None,
        parse_stats: Optional[Dict[str, int]] = None,
    ) -> Dict[str, Any]:
        # Authenticated callers pass a deterministic id (e.g. derived from
        # their email) so re-uploading replaces the existing deck instead of
        # creating an orphan session.
        user_id = user_id or "u_" + secrets.token_urlsafe(8)
        state = {
            "user_id": user_id,
            "native_language": native_language,
            "target_language": target_language,
            "vocabulary": [{"word": w["word"], "translation": w["translation"], "seen": False} for w in words],
            "current_index": 0,
            "stats": {"correct": 0, "incorrect": 0, "close": 0},
            "source": source,
        }
        self.progress_agent.save_progress(user_id, state)
        out = {
            "user_id": user_id,
            "total": len(words),
            "target_language": target_language,
            "native_language": native_language,
            "llm_live": self.llm.is_live,
        }
        if parse_stats:
            out["parse_stats"] = parse_stats
        return out

    def handle_upload(
        self,
        filename: str,
        file_bytes: bytes,
        native_language: str,
        target_language: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.file_agent.validate_file(filename, len(file_bytes))
        text = self.file_agent.read_local(filename, file_bytes)
        words, stats = self.file_agent.extract_words_with_stats(text)
        return self._build_session(
            words, native_language, target_language, filename,
            user_id=user_id, parse_stats=stats,
        )

    def handle_drive_upload(
        self,
        file_id: str,
        native_language: str,
        target_language: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        text = self.file_agent.read_pdf_from_drive(file_id)
        words, stats = self.file_agent.extract_words_with_stats(text)
        return self._build_session(
            words, native_language, target_language, f"drive:{file_id}",
            user_id=user_id, parse_stats=stats,
        )

    _DEMO_PAIRS = [
        ("hola", "hello"),
        ("adiós", "goodbye"),
        ("gracias", "thank you"),
        ("por favor", "please"),
        ("agua", "water"),
        ("libro", "book"),
        ("amigo", "friend"),
        ("tiempo", "time"),
        ("comida", "food"),
        ("escuela", "school"),
        ("trabajo", "work"),
        ("casa", "house"),
    ]

    def handle_demo(
        self, native_language: str = "English", target_language: str = "Spanish"
    ) -> Dict[str, Any]:
        words = [{"word": w, "translation": t} for w, t in self._DEMO_PAIRS]
        return self._build_session(words, native_language, target_language, "demo.txt")

    # -- Learning flow -----------------------------------------------------

    def get_card(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.vocab_agent.get_next_word(user_id)

    def previous_card(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.vocab_agent.get_previous_word(user_id)

    def advance_card(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.vocab_agent.advance(user_id)

    def seek_card(self, user_id: str, idx: int) -> Optional[Dict[str, Any]]:
        return self.vocab_agent.seek(user_id, idx)

    def generate_word_sentences(self, user_id: str, count: int = 3) -> Dict[str, Any]:
        """Ask the LLM for example sentences using the current word."""
        session = self.storage.load(user_id)
        card = self.vocab_agent.card_from_session(session)
        if card is None:
            raise LookupError("No active card.")
        sentences = self.grammar_agent.generate_word_sentences(
            session["target_language"], card["word"], count=count
        )
        return {
            "word": card["word"],
            "translation": card["translation"],
            "language": session["target_language"],
            "sentences": sentences,
        }

    def review(self, user_id: str, user_input: str, advance: bool = True) -> Dict[str, Any]:
        # Single load + single save per review. Mutations happen on the
        # in-memory `session` dict via session-based agent helpers.
        session = self.storage.load(user_id)
        card = self.vocab_agent.card_from_session(session)
        if card is None:
            raise LookupError("No active card.")
        result = self.review_agent.check_translation(user_input, card["translation"])
        stats = self.progress_agent.apply_stats_in_session(session, result)
        if result["correct"]:
            self.vocab_agent.mark_seen_in_session(session, card["word"])
            if advance:
                result["next_card"] = self.vocab_agent.advance_in_session(session)
        self.storage.save(user_id, session)
        result["stats"] = stats
        return result

    # -- Grammar flow ------------------------------------------------------

    def grammar_topics(self, user_id: str, level: str = "advanced") -> List[Dict[str, str]]:
        session = self.progress_agent.load_progress(user_id)
        return self.grammar_agent.generate_philology_topics(
            session["target_language"], level=level
        )

    def grammar_content(self, user_id: str, topic: str) -> Dict[str, Any]:
        session = self.progress_agent.load_progress(user_id)
        # Pass both target word and native translation so the LLM can ground
        # native-language sentences in the vocabulary the user is learning.
        vocab_pairs = [(v["word"], v["translation"]) for v in session["vocabulary"]]
        return self.grammar_agent.generate_topic_content(
            session["target_language"], topic, vocab_pairs
        )

    # -- Progress flow -----------------------------------------------------

    def restore_upload(
        self,
        user_id: str,
        upload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Rebuild a session from a saved upload-history entry."""
        words = [
            {"word": v["word"], "translation": v["translation"]}
            for v in upload["vocabulary"]
        ]
        return self._build_session(
            words,
            upload.get("native_language", "English"),
            upload.get("target_language", "Spanish"),
            f"history:{upload.get('id', '?')}",
            user_id=user_id,
        )

    def vocabulary(self, user_id: str) -> Dict[str, Any]:
        s = self.storage.load(user_id)
        return {
            "user_id": s["user_id"],
            "current_index": s["current_index"],
            "total": len(s["vocabulary"]),
            "vocabulary": [
                {"index": i, "word": v["word"], "translation": v["translation"], "seen": v.get("seen", False)}
                for i, v in enumerate(s["vocabulary"])
            ],
            "target_language": s["target_language"],
            "native_language": s["native_language"],
        }

    def progress(self, user_id: str) -> Dict[str, Any]:
        s = self.progress_agent.load_progress(user_id)
        seen = sum(1 for v in s["vocabulary"] if v.get("seen"))
        return {
            "user_id": s["user_id"],
            "current": s["current_index"],
            "total": len(s["vocabulary"]),
            "seen": seen,
            "stats": s.get("stats", {"correct": 0, "incorrect": 0, "close": 0}),
            "native_language": s["native_language"],
            "target_language": s["target_language"],
        }
