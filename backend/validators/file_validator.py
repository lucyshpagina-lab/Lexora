"""Deterministic file validation. No LLM involved here, by design."""

from pathlib import Path


ALLOWED_EXTENSIONS = {".pdf", ".txt"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class FileValidationError(ValueError):
    pass


def validate_file(filename: str, size: int) -> str:
    if not filename:
        raise FileValidationError("Missing filename.")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(
            f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}."
        )
    if size <= 0:
        raise FileValidationError("File is empty.")
    if size > MAX_SIZE_BYTES:
        raise FileValidationError(
            f"File too large ({size} bytes). Limit is {MAX_SIZE_BYTES} bytes."
        )
    return ext
