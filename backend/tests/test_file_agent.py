import pytest

from agents.file_agent import FileAgent
from validators.file_validator import FileValidationError


@pytest.fixture
def agent():
    return FileAgent()


def test_extract_words_dash(agent):
    text = "hola - hello\nadios - goodbye"
    words = agent.extract_words(text)
    assert words == [
        {"word": "hola", "translation": "hello"},
        {"word": "adios", "translation": "goodbye"},
    ]


def test_extract_words_multiple_separators(agent):
    text = "uno: one\ndos = two\ntres\tthree\ncuatro – four\ncinco — five"
    words = agent.extract_words(text)
    assert {w["word"] for w in words} == {"uno", "dos", "tres", "cuatro", "cinco"}


def test_extract_words_arrow_separators(agent):
    text = "voiture → car\nmaison ⇒ house\nfleur ⟶ flower\ntable » desk"
    words = agent.extract_words(text)
    assert {w["word"] for w in words} == {"voiture", "maison", "fleur", "table"}


def test_extract_words_pipe_and_column_separators(agent):
    text = "alpha | first\nbeta    second\ngamma   third"  # last two use 3+ spaces
    words = agent.extract_words(text)
    assert {w["word"] for w in words} == {"alpha", "beta", "gamma"}


def test_extract_words_language_agnostic_cyrillic(agent):
    text = "дом - house\nкнига - book\nдружба - friendship"
    words = agent.extract_words(text)
    assert [w["word"] for w in words] == ["дом", "книга", "дружба"]
    assert words[0]["translation"] == "house"


def test_extract_words_with_stats_counts_lines(agent):
    text = (
        "uno - one\n"
        "this line is prose with no separator at all\n"
        "dos - two\n"
        "\n"             # blank lines do not count toward total_lines
        "another prose line that we cannot parse here\n"
        "tres - three\n"
    )
    words, stats = agent.extract_words_with_stats(text)
    assert [w["word"] for w in words] == ["uno", "dos", "tres"]
    assert stats == {"parsed": 3, "total_lines": 5}


def test_extract_words_dedupe_case_insensitive(agent):
    text = "casa - house\nCASA - home"
    words = agent.extract_words(text)
    assert len(words) == 1
    assert words[0]["word"] == "casa"


def test_extract_words_skips_blank_and_unparseable(agent):
    text = "\n\nthis line has no separator\nlibro - book\n"
    words = agent.extract_words(text)
    assert words == [{"word": "libro", "translation": "book"}]


def test_extract_words_strips_trailing_punctuation(agent):
    text = "hola - hello,\nadios - goodbye."
    words = agent.extract_words(text)
    assert words[0]["translation"] == "hello"
    assert words[1]["translation"] == "goodbye"


def test_extract_words_skips_short_numeric_artifacts(agent):
    text = "12 - x\nlibro - book"
    words = agent.extract_words(text)
    assert [w["word"] for w in words] == ["libro"]


def test_extract_words_empty_raises(agent):
    with pytest.raises(FileValidationError, match="empty"):
        agent.extract_words("   ")


def test_extract_words_no_matches_raises(agent):
    with pytest.raises(FileValidationError, match="No vocabulary"):
        agent.extract_words("just some prose without any separators here")


def test_read_local_unsupported_extension(agent):
    with pytest.raises(FileValidationError, match="Unsupported"):
        agent.read_local("file.docx", b"x")


def test_read_local_rejects_txt(agent):
    # .txt is no longer a supported source format (PDF only).
    with pytest.raises(FileValidationError, match="Unsupported"):
        agent.read_local("file.txt", b"hola - hello")


# -- Drive: public-link fallback ------------------------------------------


class _FakeResp:
    """Minimal stand-in for urllib.request.urlopen's context manager result."""

    def __init__(self, body: bytes):
        self._body = body

    def read(self, _n):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None


def _patch_urlopen(monkeypatch, body: bytes):
    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout: _FakeResp(body))


def test_fetch_public_drive_pdf_returns_bytes(agent, monkeypatch):
    pdf = b"%PDF-1.4 fake content"
    _patch_urlopen(monkeypatch, pdf)
    assert agent._fetch_public_drive_pdf("abc123ABC_xyz") == pdf


def test_fetch_public_drive_html_raises_with_sharing_hint(agent, monkeypatch):
    """If Google returns HTML, the error must mention the sharing requirement."""
    _patch_urlopen(monkeypatch, b"<!DOCTYPE html><html><body>Permission denied</body></html>")
    with pytest.raises(FileValidationError, match="Anyone with the link"):
        agent._fetch_public_drive_pdf("abc123ABC_xyz")


def test_fetch_public_drive_non_pdf_raises(agent, monkeypatch):
    _patch_urlopen(monkeypatch, b"GIF89a\x00\x00")
    with pytest.raises(FileValidationError, match="non-PDF"):
        agent._fetch_public_drive_pdf("abc123ABC_xyz")


def test_fetch_public_drive_http_error_raises(agent, monkeypatch):
    import urllib.error, urllib.request
    def _raise(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, None)
    monkeypatch.setattr(urllib.request, "urlopen", _raise)
    with pytest.raises(FileValidationError, match="HTTP 404"):
        agent._fetch_public_drive_pdf("abc123ABC_xyz")


def test_read_pdf_from_drive_uses_public_when_no_mcp(agent, monkeypatch):
    monkeypatch.delenv("LEXORA_DRIVE_MCP_CMD", raising=False)
    monkeypatch.setattr(agent, "_fetch_public_drive_pdf", lambda fid: b"%PDF-1.4")
    monkeypatch.setattr(agent, "read_pdf_local", lambda b: "voiture - car")
    assert agent.read_pdf_from_drive("abc123ABC_xyz") == "voiture - car"


def test_read_pdf_from_drive_rejects_invalid_id(agent, monkeypatch):
    monkeypatch.delenv("LEXORA_DRIVE_MCP_CMD", raising=False)
    with pytest.raises(FileValidationError, match="Invalid"):
        agent.read_pdf_from_drive("abc;rm -rf /")


def test_read_pdf_from_drive_rejects_empty_id(agent, monkeypatch):
    monkeypatch.delenv("LEXORA_DRIVE_MCP_CMD", raising=False)
    with pytest.raises(FileValidationError, match="Missing"):
        agent.read_pdf_from_drive("   ")
