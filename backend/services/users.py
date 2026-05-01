"""SQLite-backed user + OTP storage. WAL mode, lock-protected writes."""

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


class UserStore:
    def __init__(self, db_path: str = "./data/users.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(str(self.db_path), isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _init_schema(self) -> None:
        with self._lock, self._conn() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    verified INTEGER NOT NULL DEFAULT 0,
                    avatar_path TEXT,
                    preferred_language TEXT,
                    custom_languages TEXT NOT NULL DEFAULT '[]',
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS otp_codes (
                    email TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0
                );
                """
            )

    # -- User CRUD ---------------------------------------------------------

    def create(self, email: str, name: str, password_hash: str) -> bool:
        try:
            with self._lock, self._conn() as c:
                c.execute(
                    "INSERT INTO users (email, name, password_hash, created_at) "
                    "VALUES (?, ?, ?, ?)",
                    (email, name, password_hash, int(time.time())),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def get(self, email: str) -> Optional[Dict[str, Any]]:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ).fetchone()
            return dict(row) if row else None

    def mark_verified(self, email: str) -> None:
        with self._lock, self._conn() as c:
            c.execute("UPDATE users SET verified = 1 WHERE email = ?", (email,))

    def update_password(self, email: str, new_hash: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE users SET password_hash = ? WHERE email = ?",
                (new_hash, email),
            )

    def set_avatar(self, email: str, path: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE users SET avatar_path = ? WHERE email = ?", (path, email)
            )

    def set_preferred_language(self, email: str, lang: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE users SET preferred_language = ? WHERE email = ?",
                (lang, email),
            )

    def add_custom_language(self, email: str, lang: str) -> List[str]:
        with self._lock, self._conn() as c:
            row = c.execute(
                "SELECT custom_languages FROM users WHERE email = ?", (email,)
            ).fetchone()
            if not row:
                return []
            langs = json.loads(row["custom_languages"] or "[]")
            if lang not in langs:
                langs.append(lang)
                c.execute(
                    "UPDATE users SET custom_languages = ? WHERE email = ?",
                    (json.dumps(langs), email),
                )
            return langs

    def delete(self, email: str) -> None:
        with self._lock, self._conn() as c:
            c.execute("DELETE FROM users WHERE email = ?", (email,))
            c.execute("DELETE FROM otp_codes WHERE email = ?", (email,))


class OTPStore:
    """Tied to a UserStore so OTP records share the same DB and lock."""

    MAX_ATTEMPTS = 5
    DEFAULT_TTL = 600  # 10 minutes

    def __init__(self, user_store: UserStore):
        self.us = user_store

    def create(self, email: str, code: str, ttl_seconds: int = DEFAULT_TTL) -> None:
        with self.us._lock, self.us._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO otp_codes (email, code, expires_at, attempts) "
                "VALUES (?, ?, ?, 0)",
                (email, code, int(time.time()) + ttl_seconds),
            )

    def verify(self, email: str, code: str) -> bool:
        with self.us._lock, self.us._conn() as c:
            row = c.execute(
                "SELECT code, expires_at, attempts FROM otp_codes WHERE email = ?",
                (email,),
            ).fetchone()
            if not row:
                return False
            if int(time.time()) > row["expires_at"]:
                c.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
                return False
            if row["attempts"] + 1 > self.MAX_ATTEMPTS:
                c.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
                return False
            if row["code"] != code:
                c.execute(
                    "UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?",
                    (email,),
                )
                return False
            c.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
            return True

    def peek(self, email: str) -> Optional[str]:
        """Return the active code for an email (test/debug only)."""
        with self.us._conn() as c:
            row = c.execute(
                "SELECT code, expires_at FROM otp_codes WHERE email = ?", (email,)
            ).fetchone()
            if not row or int(time.time()) > row["expires_at"]:
                return None
            return row["code"]
