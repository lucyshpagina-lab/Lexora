"""Deterministic file validation. No LLM involved here, by design."""

from pathlib import Path


REQUIRED_FILENAME = "vocabulary.pdf"
ALLOWED_EXTENSIONS = {".pdf"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class FileValidationError(ValueError):
    pass


def validate_file(filename: str, size: int) -> str:
    if not filename:
        raise FileValidationError("Missing filename.")
    # Strip any directory components a client might smuggle in (path traversal).
    base = Path(filename).name.lower()
    if base != REQUIRED_FILENAME:
        raise FileValidationError(
            f"File must be named '{REQUIRED_FILENAME}'. Got '{Path(filename).name}'."
        )
    ext = Path(base).suffix
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


def validate_pair_lines(content: str) -> None:
    """Strict content gate: every non-empty line must look like 'word - word'.

    Used as a security check — we don't want arbitrary PDF prose, scripts, or
    embedded payloads to slip into the vocabulary pipeline. Allows only:
      * blank lines
      * lines that match the same separator pattern the parser uses
    Anything else (free-form text, page numbers, headers, footers) is rejected.
    """
    # Local import to avoid a circular dependency (file_agent imports this module).
    from agents.file_agent import _SEPARATOR_RE

    if not content or not content.strip():
        raise FileValidationError("Document is empty after extraction.")

    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        if not _SEPARATOR_RE.match(line):
            preview = line if len(line) <= 80 else line[:77] + "..."
            raise FileValidationError(
                "File must contain only 'word1 - word2' pairs. "
                f"Offending line: {preview!r}"
            )
