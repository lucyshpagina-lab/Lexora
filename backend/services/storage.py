"""JSON file storage for sessions. One file per user_id under data/."""

import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional


class Storage:
    def __init__(self, base_dir: str = "./data"):
        self.base = Path(base_dir)
        self.base.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, user_id: str) -> Path:
        safe = "".join(c for c in user_id if c.isalnum() or c in "-_")
        if not safe:
            raise ValueError(f"Invalid user_id: {user_id!r}")
        return self.base / f"{safe}.json"

    def save(self, user_id: str, state: Dict[str, Any]) -> None:
        with self._lock:
            path = self._path(user_id)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(path)

    def load(self, user_id: str) -> Dict[str, Any]:
        path = self._path(user_id)
        if not path.exists():
            raise KeyError(f"No session for user_id={user_id!r}")
        with self._lock:
            return json.loads(path.read_text(encoding="utf-8"))

    def exists(self, user_id: str) -> bool:
        try:
            return self._path(user_id).exists()
        except ValueError:
            return False

    def get(self, user_id: str, default: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        try:
            return self.load(user_id)
        except (KeyError, FileNotFoundError):
            return default
