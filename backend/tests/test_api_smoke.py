"""HTTP-level smoke tests via FastAPI TestClient.

These are regression guards for the public API shape. They use the real
Orchestrator with a mock LLM (no ANTHROPIC_API_KEY) and the default file
storage redirected to a tmp dir per test.
"""

import os

import pytest
from fastapi.testclient import TestClient

from services.storage import Storage


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.chdir(tmp_path)  # so Storage default ./data lands in tmp
    # Reload main with isolated storage. main.py instantiates Orchestrator
    # at import time, so we import after chdir.
    import importlib
    import main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "llm_live" in body


def test_demo_creates_session(client):
    r = client.post("/api/demo", json={"native_language": "English", "target_language": "Spanish"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 12
    assert body["user_id"].startswith("u_")
    assert body["target_language"] == "Spanish"


def test_demo_with_no_body_uses_defaults(client):
    r = client.post("/api/demo")
    assert r.status_code == 200
    assert r.json()["total"] == 12


def test_full_review_flow(client):
    uid = client.post("/api/demo").json()["user_id"]

    # next word
    card = client.get(f"/api/word/next?user_id={uid}").json()
    assert card["done"] is False
    assert card["index"] == 0
    assert card["word"] == "hola"

    # review correct
    r = client.post("/api/review", json={"user_id": uid, "answer": "hello"})
    body = r.json()
    assert body["correct"] is True
    assert body["stats"] == {"correct": 1, "incorrect": 0, "close": 0}
    assert body["next_card"]["index"] == 1

    # review incorrect
    r = client.post("/api/review", json={"user_id": uid, "answer": "wrong"})
    body = r.json()
    assert body["correct"] is False
    assert body["stats"]["incorrect"] == 1


def test_review_unknown_session_returns_404(client):
    r = client.post("/api/review", json={"user_id": "u_nope", "answer": "x"})
    assert r.status_code == 404


def test_progress_endpoint(client):
    uid = client.post("/api/demo").json()["user_id"]
    r = client.get(f"/api/progress/{uid}")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 12
    assert body["seen"] == 0
    assert body["current"] == 0


def test_upload_endpoint(client):
    files = {"file": ("words.txt", b"uno - one\ndos - two\ntres - three", "text/plain")}
    r = client.post("/api/upload", files=files, data={"native_language": "English", "target_language": "Spanish"})
    assert r.status_code == 200
    assert r.json()["total"] == 3


def test_upload_rejects_bad_extension(client):
    files = {"file": ("words.zip", b"x", "application/zip")}
    r = client.post("/api/upload", files=files)
    assert r.status_code == 400


def test_grammar_topics_with_mock_llm(client):
    uid = client.post("/api/demo").json()["user_id"]
    r = client.get(f"/api/grammar/topics?user_id={uid}")
    assert r.status_code == 200
    topics = r.json()["topics"]
    assert isinstance(topics, list)
    assert len(topics) > 0
    assert "topic" in topics[0]
    assert "description" in topics[0]


def test_grammar_content_with_mock_llm(client):
    uid = client.post("/api/demo").json()["user_id"]
    r = client.post(
        "/api/grammar/content",
        json={"user_id": uid, "topic": "Verbal Categories"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "rule" in body
    assert "scheme" in body
    assert isinstance(body["sentences"], list)
    assert len(body["sentences"]) == 10
