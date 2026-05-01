"""End-to-end orchestrator tests with a real Storage on tmp_path.

These tests are the regression net for the review() refactor: the public
behaviour of `review()` and the demo/upload flows must not change.
"""

import pytest

from agents.orchestrator import Orchestrator
from services.storage import Storage


@pytest.fixture
def orch(tmp_path):
    return Orchestrator(storage=Storage(base_dir=str(tmp_path)))


def test_handle_demo_creates_session(orch):
    out = orch.handle_demo("English", "Spanish")
    assert out["total"] == 12
    assert out["native_language"] == "English"
    assert out["target_language"] == "Spanish"
    assert out["user_id"].startswith("u_")
    state = orch.storage.load(out["user_id"])
    assert len(state["vocabulary"]) == 12
    assert state["current_index"] == 0
    assert state["stats"] == {"correct": 0, "incorrect": 0, "close": 0}


def test_get_card_returns_first_word(orch):
    out = orch.handle_demo()
    card = orch.get_card(out["user_id"])
    assert card["index"] == 0
    assert card["word"] == "hola"


def test_review_correct_advances_and_marks_seen(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    result = orch.review(uid, "hello")
    assert result["correct"] is True
    assert result["stats"] == {"correct": 1, "incorrect": 0, "close": 0}
    assert "next_card" in result
    assert result["next_card"]["index"] == 1
    state = orch.storage.load(uid)
    assert state["vocabulary"][0]["seen"] is True
    assert state["current_index"] == 1


def test_review_correct_without_advance(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    result = orch.review(uid, "hello", advance=False)
    assert result["correct"] is True
    assert "next_card" not in result
    state = orch.storage.load(uid)
    assert state["current_index"] == 0
    assert state["vocabulary"][0]["seen"] is True


def test_review_incorrect_does_not_advance(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    result = orch.review(uid, "totally wrong")
    assert result["correct"] is False
    assert result["close"] is False
    assert result["stats"] == {"correct": 0, "incorrect": 1, "close": 0}
    state = orch.storage.load(uid)
    assert state["current_index"] == 0
    assert state["vocabulary"][0]["seen"] is False


def test_review_close_counts_as_close(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    # 'helllo' vs 'hello' is close enough (>= 0.85 ratio) but not exact
    result = orch.review(uid, "helllo")
    assert result["correct"] is False
    assert result["close"] is True
    assert result["stats"] == {"correct": 0, "incorrect": 0, "close": 1}
    state = orch.storage.load(uid)
    assert state["current_index"] == 0


def test_review_unknown_user_raises_keyerror(orch):
    with pytest.raises(KeyError):
        orch.review("u_doesnotexist", "anything")


def test_review_after_deck_finished_raises(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    # Manually move past end of deck
    state = orch.storage.load(uid)
    state["current_index"] = len(state["vocabulary"])
    orch.storage.save(uid, state)
    with pytest.raises(LookupError):
        orch.review(uid, "anything")


def test_progress_reports_seen_count(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    orch.review(uid, "hello")        # correct → index 1, hola.seen
    orch.review(uid, "goodbye")      # correct → index 2, adios.seen
    p = orch.progress(uid)
    assert p["seen"] == 2
    assert p["current"] == 2
    assert p["total"] == 12
    assert p["stats"]["correct"] == 2


def test_previous_card_decrements(orch):
    out = orch.handle_demo()
    uid = out["user_id"]
    orch.review(uid, "hello")  # advance to index 1
    card = orch.previous_card(uid)
    assert card["index"] == 0


def test_handle_upload_extracts_words(orch, monkeypatch):
    text = "uno - one\ndos - two\ntres - three"
    # Bypass real PDF parsing — we already test extract_words separately.
    monkeypatch.setattr(orch.file_agent, "read_pdf_local", lambda b: text)
    out = orch.handle_upload("words.pdf", b"%PDF-1.4 stub", "English", "Spanish")
    assert out["total"] == 3
    state = orch.storage.load(out["user_id"])
    assert [v["word"] for v in state["vocabulary"]] == ["uno", "dos", "tres"]


def test_handle_upload_returns_parse_stats(orch, monkeypatch):
    """Upload response must surface parse stats so the UI can show progress."""
    text = (
        "uno - one\n"
        "this line cannot be parsed\n"
        "dos - two\n"
    )
    monkeypatch.setattr(orch.file_agent, "read_pdf_local", lambda b: text)
    out = orch.handle_upload("words.pdf", b"%PDF-1.4", "English", "Spanish")
    assert out["parse_stats"] == {"parsed": 2, "total_lines": 3}


def test_handle_drive_upload_uses_mcp_then_parses(orch, monkeypatch):
    """Drive flow: MCP returns text → parser → session built like a local upload."""
    monkeypatch.setattr(
        orch.file_agent, "read_pdf_from_drive",
        lambda fid: "voiture → car\nfleur → flower",
    )
    out = orch.handle_drive_upload("abc-DEF_123", "English", "French")
    assert out["total"] == 2
    assert out["parse_stats"]["parsed"] == 2
    state = orch.storage.load(out["user_id"])
    assert [v["word"] for v in state["vocabulary"]] == ["voiture", "fleur"]
    assert state["source"] == "drive:abc-DEF_123"


def test_handle_upload_rejects_txt(orch):
    import pytest
    from validators.file_validator import FileValidationError
    with pytest.raises(FileValidationError, match="Unsupported"):
        orch.handle_upload("words.txt", b"uno - one", "English", "Spanish")


def test_review_does_one_load_and_one_save(orch):
    """Regression guard for the IO consolidation in Orchestrator.review()."""
    out = orch.handle_demo()
    uid = out["user_id"]

    loads, saves = [], []
    real_load, real_save = orch.storage.load, orch.storage.save

    def counting_load(u):
        loads.append(u)
        return real_load(u)

    def counting_save(u, s):
        saves.append(u)
        return real_save(u, s)

    orch.storage.load = counting_load    # type: ignore[method-assign]
    orch.storage.save = counting_save    # type: ignore[method-assign]

    orch.review(uid, "hello")  # correct → triggers all three mutations

    assert loads == [uid], f"expected 1 load, got {len(loads)}: {loads}"
    assert saves == [uid], f"expected 1 save, got {len(saves)}: {saves}"
