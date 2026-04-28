"""Lexora FastAPI app — all HTTP routing lives here. Logic stays in agents/."""

import json
import os
import re
import secrets
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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
    return {
        "email": user["email"],
        "name": user["name"],
        "verified": bool(user["verified"]),
        "avatar_path": user["avatar_path"],
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


@app.post("/api/upload")
async def upload(
    file: UploadFile = File(...),
    native_language: str = Form("English"),
    target_language: str = Form("Spanish"),
):
    contents = await file.read()
    try:
        return orchestrator.handle_upload(
            file.filename or "upload", contents, native_language, target_language
        )
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/upload/drive")
def upload_drive(req: DriveUploadRequest):
    try:
        return orchestrator.handle_drive_upload(
            req.file_id, req.native_language, req.target_language
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
    return {"pending_email": email, "expires_in": 600}


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


@app.delete("/api/auth/me")
def delete_account(email: str = Depends(auth_service.get_current_user_email)):
    user_store.delete(email)
    return {"ok": True}


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
    return {"avatar_path": str(path)}


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
