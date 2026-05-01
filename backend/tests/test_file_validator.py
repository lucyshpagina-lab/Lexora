import pytest

from validators.file_validator import (
    MAX_SIZE_BYTES,
    REQUIRED_FILENAME,
    FileValidationError,
    validate_file,
    validate_pair_lines,
)


def test_accepts_required_filename():
    assert validate_file("vocabulary.pdf", 1024) == ".pdf"


def test_accepts_filename_case_insensitive():
    assert validate_file("Vocabulary.PDF", 1024) == ".pdf"


def test_accepts_required_filename_constant():
    assert REQUIRED_FILENAME == "vocabulary.pdf"


def test_rejects_other_pdf_filename():
    with pytest.raises(FileValidationError, match="must be named"):
        validate_file("notes.pdf", 1024)


def test_rejects_my_vocabulary_legacy_name():
    with pytest.raises(FileValidationError, match="must be named"):
        validate_file("my_vocabulary.pdf", 1024)


def test_rejects_txt():
    with pytest.raises(FileValidationError, match="must be named"):
        validate_file("notes.txt", 1024)


def test_rejects_missing_filename():
    with pytest.raises(FileValidationError, match="Missing filename"):
        validate_file("", 1024)


def test_rejects_unsupported_extension():
    with pytest.raises(FileValidationError, match="must be named"):
        validate_file("archive.zip", 1024)


def test_strips_path_prefix_and_still_accepts():
    # Defends against a client smuggling path components.
    assert validate_file("/tmp/evil/vocabulary.pdf", 1024) == ".pdf"


def test_rejects_empty_file():
    with pytest.raises(FileValidationError, match="empty"):
        validate_file("vocabulary.pdf", 0)


def test_rejects_oversized_file():
    with pytest.raises(FileValidationError, match="too large"):
        validate_file("vocabulary.pdf", MAX_SIZE_BYTES + 1)


# -- Pair-line content validation -----------------------------------------


def test_validate_pair_lines_accepts_clean_pairs():
    validate_pair_lines("hola - hello\nadios - goodbye\n")


def test_validate_pair_lines_allows_blank_lines():
    validate_pair_lines("hola - hello\n\nadios - goodbye\n")


def test_validate_pair_lines_rejects_prose():
    with pytest.raises(FileValidationError, match="word1 - word2"):
        validate_pair_lines("hola - hello\nthis is not a pair\n")


def test_validate_pair_lines_rejects_page_number():
    with pytest.raises(FileValidationError, match="word1 - word2"):
        validate_pair_lines("hola - hello\nPage 3\n")


def test_validate_pair_lines_rejects_empty_document():
    with pytest.raises(FileValidationError, match="empty"):
        validate_pair_lines("   \n\n")
