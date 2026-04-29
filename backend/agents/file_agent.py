"""File Agent — upload, validation, parsing. Deterministic; no LLM calls."""

import io
import re
from pathlib import Path
from typing import List, Dict, Tuple

from validators.file_validator import validate_file as _validate, FileValidationError


# Word-translation separators we recognize: dashes, colon, equals, tab,
# unicode arrows, vertical bar, two-or-more spaces (two-column PDF layout).
_SEP_CHARS = r"\t:=\-–—|→⇒⟶»"
_SEPARATOR_RE = re.compile(
    rf"^(?P<word>[^{_SEP_CHARS}]{{1,80}}?)\s*(?:[{_SEP_CHARS}]+|\s{{2,}})\s*(?P<translation>.{{1,200}})$"
)


class FileAgent:
    def validate_file(self, filename: str, size: int) -> str:
        return _validate(filename, size)

    # -- PDF / text loaders -------------------------------------------------

    def read_pdf_local(self, file_bytes: bytes) -> str:
        from pypdf import PdfReader  # local import: only needed for PDFs
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
        except Exception as e:
            raise FileValidationError(f"Could not read PDF: {e}") from e
        pages = []
        for page in reader.pages:
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            pages.append(txt)
        return "\n".join(pages)

    def read_pdf_from_drive(self, file_id: str) -> str:
        """Fetch a Drive file via the configured MCP server.

        Delegates to :mod:`services.drive_mcp` which speaks JSON-RPC over
        stdio with the MCP server pointed to by ``LEXORA_DRIVE_MCP_CMD``.

        If the server returns base64-encoded bytes (a real PDF), they are
        parsed with pypdf locally. If it returns text already extracted by
        the server, that text is returned as-is.
        """
        from services import drive_mcp

        try:
            result = drive_mcp.fetch_drive_file(file_id)
        except drive_mcp.DriveMCPError as e:
            raise FileValidationError(str(e)) from e

        if result.pdf_bytes is not None:
            return self.read_pdf_local(result.pdf_bytes)
        if result.text is not None:
            return result.text
        raise FileValidationError("Drive MCP returned an empty result.")

    def read_local(self, filename: str, file_bytes: bytes) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return self.read_pdf_local(file_bytes)
        raise FileValidationError(f"Unsupported extension: {ext}")

    # -- Vocabulary extraction ---------------------------------------------

    def extract_words(self, content: str) -> List[Dict[str, str]]:
        """Parse 'word - translation' lines from extracted text.

        Language-agnostic: words and translations may be in any script.
        Recognized separators: dashes, colon, equals, tab, unicode arrows,
        vertical bar, or two-or-more consecutive spaces (two-column PDFs).
        Lines that don't match are skipped. Duplicates by word are dropped.
        """
        words, _ = self.extract_words_with_stats(content)
        return words

    def extract_words_with_stats(
        self, content: str
    ) -> Tuple[List[Dict[str, str]], Dict[str, int]]:
        """Like extract_words, but also returns parse stats for UI feedback."""
        if not content or not content.strip():
            raise FileValidationError("Document is empty after extraction.")

        entries: List[Dict[str, str]] = []
        seen = set()
        total_lines = 0
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue
            total_lines += 1
            # Skip lines that are obviously prose (long, no separator).
            if len(line) > 300:
                continue
            m = _SEPARATOR_RE.match(line)
            if not m:
                continue
            word = m.group("word").strip().rstrip(".,;")
            translation = m.group("translation").strip().rstrip(".,;")
            if not word or not translation:
                continue
            if any(ch.isdigit() for ch in word) and len(word) <= 3:
                # likely a page-number / list-index artefact
                continue
            key = word.lower()
            if key in seen:
                continue
            seen.add(key)
            entries.append({"word": word, "translation": translation})

        if not entries:
            raise FileValidationError(
                "No vocabulary entries found. Expected lines like 'word - translation'."
            )
        return entries, {"total_lines": total_lines, "parsed": len(entries)}
