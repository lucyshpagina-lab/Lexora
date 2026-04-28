"""Lexora FastAPI app — all HTTP routing lives here. Logic stays in agents/."""

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents.orchestrator import Orchestrator
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
