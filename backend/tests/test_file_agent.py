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
