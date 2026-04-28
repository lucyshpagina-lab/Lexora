"""Password hashing + JWT issuance/verification + FastAPI auth dependency."""

import os
import time
from typing import Optional

import bcrypt
import jwt
from fastapi import Header, HTTPException


JWT_SECRET = os.environ.get(
    "LEXORA_JWT_SECRET",
    "dev-secret-change-me-in-prod-please-set-LEXORA_JWT_SECRET",
)
JWT_ALGO = "HS256"
JWT_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def issue_jwt(email: str) -> str:
    now = int(time.time())
    payload = {"sub": email, "iat": now, "exp": now + JWT_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def get_current_user_email(authorization: Optional[str] = Header(None)) -> str:
    """FastAPI dependency: extract email from Bearer JWT or fail with 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    email = verify_jwt(authorization[7:].strip())
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return email
