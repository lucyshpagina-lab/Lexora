"""Progress Agent — persistence of session state and statistics."""

from typing import Any, Dict


class ProgressAgent:
    def __init__(self, storage):
        self.storage = storage

    def save_progress(self, user_id: str, state: Dict[str, Any]) -> None:
        self.storage.save(user_id, state)

    def load_progress(self, user_id: str) -> Dict[str, Any]:
        return self.storage.load(user_id)

    # -- Session-based helper (no IO) --------------------------------------

    def apply_stats_in_session(
        self, session: Dict[str, Any], result: Dict[str, Any]
    ) -> Dict[str, int]:
        stats = session.setdefault(
            "stats", {"correct": 0, "incorrect": 0, "close": 0}
        )
        if result.get("correct"):
            stats["correct"] += 1
        elif result.get("close"):
            stats["close"] += 1
        else:
            stats["incorrect"] += 1
        return stats

    # -- user_id-based wrapper (load + delegate + save) --------------------

    def update_stats(self, user_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
        session = self.storage.load(user_id)
        stats = self.apply_stats_in_session(session, result)
        self.storage.save(user_id, session)
        return stats
