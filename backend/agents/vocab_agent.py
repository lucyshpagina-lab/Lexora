"""Vocabulary Agent — serves cards and tracks position in the deck."""

from typing import Optional, Dict, Any


class VocabAgent:
    def __init__(self, storage):
        self.storage = storage

    # -- Session-based helpers (no IO) -------------------------------------

    def card_from_session(self, session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        idx = session["current_index"]
        vocab = session["vocabulary"]
        if idx < 0 or idx >= len(vocab):
            return None
        entry = vocab[idx]
        return {
            "index": idx,
            "total": len(vocab),
            "word": entry["word"],
            "translation": entry["translation"],
            "seen": entry.get("seen", False),
        }

    def advance_in_session(self, session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        session["current_index"] = min(
            len(session["vocabulary"]), session["current_index"] + 1
        )
        return self.card_from_session(session)

    def retreat_in_session(self, session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        session["current_index"] = max(0, session["current_index"] - 1)
        return self.card_from_session(session)

    def seek_in_session(
        self, session: Dict[str, Any], idx: int
    ) -> Optional[Dict[str, Any]]:
        """Jump to an arbitrary card index, clamped to [0, len)."""
        total = len(session["vocabulary"])
        if total == 0:
            return None
        clamped = max(0, min(total - 1, int(idx)))
        session["current_index"] = clamped
        return self.card_from_session(session)

    def mark_seen_in_session(
        self, session: Dict[str, Any], word: Optional[str] = None
    ) -> bool:
        """Mutate session to flag matching entry as seen. Returns True if changed."""
        idx = session["current_index"]
        if not (0 <= idx < len(session["vocabulary"])):
            return False
        target_word = word or session["vocabulary"][idx]["word"]
        for entry in session["vocabulary"]:
            if entry["word"] == target_word and not entry.get("seen"):
                entry["seen"] = True
                return True
        return False

    # -- user_id-based wrappers (load + delegate + save) -------------------

    def get_next_word(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.card_from_session(self.storage.load(user_id))

    def advance(self, user_id: str) -> Optional[Dict[str, Any]]:
        session = self.storage.load(user_id)
        card = self.advance_in_session(session)
        self.storage.save(user_id, session)
        return card

    def get_previous_word(self, user_id: str) -> Optional[Dict[str, Any]]:
        session = self.storage.load(user_id)
        card = self.retreat_in_session(session)
        self.storage.save(user_id, session)
        return card

    def seek(self, user_id: str, idx: int) -> Optional[Dict[str, Any]]:
        session = self.storage.load(user_id)
        card = self.seek_in_session(session, idx)
        self.storage.save(user_id, session)
        return card

    def mark_word_seen(self, user_id: str, word: Optional[str] = None) -> None:
        session = self.storage.load(user_id)
        if self.mark_seen_in_session(session, word):
            self.storage.save(user_id, session)
