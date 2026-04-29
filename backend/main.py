"""Lexora FastAPI app — all HTTP routing lives here. Logic stays in agents/."""

import hashlib
import json
import os
import re
import secrets
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agents.orchestrator import Orchestrator
from services import auth as auth_service
from services import email as email_service
from services.users import OTPStore, UserStore
from validators.file_validator import FileValidationError
from validators.llm_validator import LLMValidationError


app = FastAPI(title="Lexora", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = Orchestrator()
user_store = UserStore(db_path=os.environ.get("LEXORA_USERS_DB", "./data/users.db"))
otp_store = OTPStore(user_store)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _generate_otp_code() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def _public_user(user: dict) -> dict:
    has_avatar = bool(user.get("avatar_path"))
    return {
        "email": user["email"],
        "name": user["name"],
        "verified": bool(user["verified"]),
        "avatar_url": f"/api/auth/avatar/{user['email']}" if has_avatar else None,
        "preferred_language": user["preferred_language"],
        "custom_languages": json.loads(user["custom_languages"] or "[]"),
    }


# -- Request models -----------------------------------------------------------


class ReviewRequest(BaseModel):
    user_id: str
    answer: str = Field(..., max_length=500)
    advance: bool = True


class GrammarContentRequest(BaseModel):
    user_id: str
    topic: str = Field(..., max_length=200)


class DriveUploadRequest(BaseModel):
    file_id: str = Field(..., max_length=200)
    native_language: str = "English"
    target_language: str = "Spanish"


class DemoRequest(BaseModel):
    native_language: str = "English"
    target_language: str = "Spanish"


# -- Routes -------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"ok": True, "llm_live": orchestrator.llm.is_live}


def _session_id_for_email(email: str) -> str:
    return "u_" + hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]


def _maybe_email(authorization: Optional[str]) -> Optional[str]:
    """Soft auth — return email if a valid bearer token is present, else None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return auth_service.verify_jwt(authorization[7:].strip())


@app.post("/api/upload")
async def upload(
    file: UploadFile = File(...),
    native_language: str = Form("English"),
    target_language: str = Form("Spanish"),
    authorization: Optional[str] = Header(None),
):
    email = _maybe_email(authorization)
    user_id = _session_id_for_email(email) if email else None
    contents = await file.read()
    try:
        return orchestrator.handle_upload(
            file.filename or "upload",
            contents,
            native_language,
            target_language,
            user_id=user_id,
        )
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/upload/drive")
def upload_drive(
    req: DriveUploadRequest,
    authorization: Optional[str] = Header(None),
):
    email = _maybe_email(authorization)
    user_id = _session_id_for_email(email) if email else None
    try:
        return orchestrator.handle_drive_upload(
            req.file_id, req.native_language, req.target_language, user_id=user_id
        )
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/demo")
def demo(req: Optional[DemoRequest] = None):
    req = req or DemoRequest()
    return orchestrator.handle_demo(req.native_language, req.target_language)


@app.get("/api/word/next")
def next_word(user_id: str):
    try:
        card = orchestrator.get_card(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")
    if card is None:
        return {"done": True}
    return {"done": False, **card}


@app.post("/api/word/previous")
def previous_word(user_id: str):
    try:
        card = orchestrator.previous_card(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")
    if card is None:
        return {"done": True}
    return {"done": False, **card}


@app.post("/api/review")
def review(req: ReviewRequest):
    try:
        return orchestrator.review(req.user_id, req.answer, advance=req.advance)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except LookupError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/api/grammar/topics")
def grammar_topics(user_id: str, level: str = "advanced"):
    try:
        return {"topics": orchestrator.grammar_topics(user_id, level)}
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except LLMValidationError as e:
        raise HTTPException(status_code=502, detail=f"LLM output invalid: {e}")


@app.post("/api/grammar/content")
def grammar_content(req: GrammarContentRequest):
    try:
        return orchestrator.grammar_content(req.user_id, req.topic)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except LLMValidationError as e:
        raise HTTPException(status_code=502, detail=f"LLM output invalid: {e}")


@app.get("/api/progress/{user_id}")
def get_progress(user_id: str):
    try:
        return orchestrator.progress(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Session not found.")


# -- Auth models --------------------------------------------------------------


class SignupRequest(BaseModel):
    email: str = Field(..., max_length=200)
    name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=200)


class VerifyOtpRequest(BaseModel):
    email: str = Field(..., max_length=200)
    code: str = Field(..., min_length=4, max_length=10)


class SigninRequest(BaseModel):
    email: str = Field(..., max_length=200)
    password: str = Field(..., max_length=200)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=200)


class LanguageRequest(BaseModel):
    language: str = Field(..., min_length=1, max_length=64)


# -- Auth routes --------------------------------------------------------------


@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    email = req.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email.")
    existing = user_store.get(email)
    if existing and existing["verified"]:
        raise HTTPException(status_code=409, detail="Account already exists.")
    if not existing:
        user_store.create(
            email, req.name.strip(), auth_service.hash_password(req.password)
        )
    else:
        # Allow re-issuing an OTP for an unverified account; refresh password too.
        user_store.update_password(email, auth_service.hash_password(req.password))
    code = _generate_otp_code()
    otp_store.create(email, code)
    try:
        email_service.send_otp(email, code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not send OTP: {e}")
    response = {"pending_email": email, "expires_in": 600}
    # In mock mode (no real email provider), surface the code so the local
    # dev UI can show it. Never returned when a real provider is configured.
    if email_service.current_provider() == "mock":
        response["dev_code"] = code
    return response


@app.post("/api/auth/verify-otp")
def verify_otp(req: VerifyOtpRequest):
    email = req.email.strip().lower()
    if not otp_store.verify(email, req.code.strip()):
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    user_store.mark_verified(email)
    user = user_store.get(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"token": auth_service.issue_jwt(email), "user": _public_user(user)}


@app.post("/api/auth/signin")
def signin(req: SigninRequest):
    email = req.email.strip().lower()
    user = user_store.get(email)
    if not user or not auth_service.verify_password(
        req.password, user["password_hash"]
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user["verified"]:
        raise HTTPException(status_code=403, detail="Email not verified.")
    return {"token": auth_service.issue_jwt(email), "user": _public_user(user)}


@app.get("/api/auth/me")
def me(email: str = Depends(auth_service.get_current_user_email)):
    user = user_store.get(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return _public_user(user)


@app.post("/api/auth/change-password")
def change_password(
    req: ChangePasswordRequest,
    email: str = Depends(auth_service.get_current_user_email),
):
    user = user_store.get(email)
    if not user or not auth_service.verify_password(
        req.old_password, user["password_hash"]
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user_store.update_password(email, auth_service.hash_password(req.new_password))
    return {"ok": True}


@app.post("/api/auth/reset-password")
def reset_password(
    req: ResetPasswordRequest,
    email: str = Depends(auth_service.get_current_user_email),
):
    if not user_store.get(email):
        raise HTTPException(status_code=404, detail="User not found.")
    user_store.update_password(email, auth_service.hash_password(req.new_password))
    return {"ok": True}


@app.delete("/api/auth/me")
def delete_account(email: str = Depends(auth_service.get_current_user_email)):
    user_store.delete(email)
    return {"ok": True}


@app.get("/api/auth/avatar/{email}")
def get_avatar(email: str):
    """Public — returns the user's avatar file by email.

    Avatars are not secret (any logged-in user could fetch them anyway via
    /api/auth/me from a session impersonating others). This endpoint exists
    so the frontend can simply use <img src=...>.
    """
    safe = "".join(ch for ch in email if ch.isalnum() or ch in "-_.@") or "anon"
    avatars_dir = Path(os.environ.get("LEXORA_AVATARS_DIR", "./data/avatars"))
    for ext in ("png", "jpg", "svg", "webp"):
        path = avatars_dir / f"{safe}.{ext}"
        if path.exists():
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="No avatar.")


@app.post("/api/auth/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    email: str = Depends(auth_service.get_current_user_email),
):
    allowed = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400, detail="Avatar must be PNG, JPEG, SVG, or WebP."
        )
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Avatar is empty.")
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar too large (max 2 MB).")
    avatars_dir = Path(os.environ.get("LEXORA_AVATARS_DIR", "./data/avatars"))
    avatars_dir.mkdir(parents=True, exist_ok=True)
    safe = "".join(ch for ch in email if ch.isalnum() or ch in "-_.@") or "anon"
    ext_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/svg+xml": "svg",
        "image/webp": "webp",
    }
    ext = ext_map[file.content_type]
    path = avatars_dir / f"{safe}.{ext}"
    path.write_bytes(content)
    user_store.set_avatar(email, str(path))
    return {"avatar_url": f"/api/auth/avatar/{email}"}


@app.post("/api/auth/language")
def set_language(
    req: LanguageRequest,
    email: str = Depends(auth_service.get_current_user_email),
):
    lang = req.language.strip()
    if not lang:
        raise HTTPException(status_code=400, detail="Missing language.")
    user_store.set_preferred_language(email, lang)
    return {"ok": True, "preferred_language": lang}


@app.post("/api/auth/language/custom")
def add_custom_language(
    req: LanguageRequest,
    email: str = Depends(auth_service.get_current_user_email),
):
    lang = req.language.strip()
    if not lang:
        raise HTTPException(status_code=400, detail="Missing language.")
    langs = user_store.add_custom_language(email, lang)
    return {"ok": True, "custom_languages": langs}


# Serve the built React study app at /app/ (vite base = /app/).
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/app", StaticFiles(directory=str(_dist), html=True), name="app")
