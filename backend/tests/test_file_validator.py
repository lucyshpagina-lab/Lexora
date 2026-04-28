import pytest

from validators.file_validator import (
    MAX_SIZE_BYTES,
    FileValidationError,
    validate_file,
)


def test_accepts_pdf():
    assert validate_file("doc.pdf", 1024) == ".pdf"


def test_accepts_txt_case_insensitive():
    assert validate_file("notes.TXT", 1024) == ".txt"


def test_rejects_missing_filename():
    with pytest.raises(FileValidationError, match="Missing filename"):
        validate_file("", 1024)


def test_rejects_unsupported_extension():
    with pytest.raises(FileValidationError, match="Unsupported file type"):
        validate_file("archive.zip", 1024)


def test_rejects_empty_file():
    with pytest.raises(FileValidationError, match="empty"):
        validate_file("a.txt", 0)


def test_rejects_oversized_file():
    with pytest.raises(FileValidationError, match="too large"):
        validate_file("a.txt", MAX_SIZE_BYTES + 1)
