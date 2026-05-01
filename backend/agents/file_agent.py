"""File Agent — upload, validation, parsing. Deterministic; no LLM calls."""

import io
import re
from pathlib import Path
from typing import List, Dict, Tuple

from validators.file_validator import (
    FileValidationError,
    validate_file as _validate,
    validate_pair_lines as _validate_pairs,
)


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
        """Fetch a Drive PDF and return its extracted text.

        Resolution order:
          1. If ``LEXORA_DRIVE_MCP_CMD`` is set, route through the configured
             MCP server (handles private files via OAuth).
          2. Otherwise, download via Drive's public ``uc?export=download``
             URL — works as long as the file is shared as
             "Anyone with the link can view".
        """
        if not file_id or not file_id.strip():
            raise FileValidationError("Missing Drive file_id.")
        if not all(c.isalnum() or c in "-_" for c in file_id):
            raise FileValidationError("Invalid Drive file_id.")

        from services import drive_mcp

        if drive_mcp.is_configured():
            try:
                result = drive_mcp.fetch_drive_file(file_id)
            except drive_mcp.DriveMCPError as e:
                raise FileValidationError(str(e)) from e
            if result.pdf_bytes is not None:
                return self.read_pdf_local(result.pdf_bytes)
            if result.text is not None:
                return result.text
            raise FileValidationError("Drive MCP returned an empty result.")

        pdf_bytes = self._fetch_public_drive_pdf(file_id)
        return self.read_pdf_local(pdf_bytes)

    def _fetch_public_drive_pdf(self, file_id: str) -> bytes:
        """Download a publicly-shared Drive PDF via the export-download URL.

        Works for files set to "Anyone with the link can view" up to ~25 MB.
        Larger files trigger a virus-scan interstitial which we surface as a
        clear error rather than silently parsing HTML.
        """
        import urllib.error
        import urllib.request

        url = f"https://drive.google.com/uc?export=download&id={file_id}"
        req = urllib.request.Request(
            url, headers={"User-Agent": "lexora/0.1 (Drive public download)"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read(15 * 1024 * 1024)
        except urllib.error.HTTPError as e:
            raise FileValidationError(
                f"Google Drive returned HTTP {e.code}. Check the file ID is "
                "correct and the file is shared as 'Anyone with the link can view'."
            ) from e
        except urllib.error.URLError as e:
            raise FileValidationError(f"Could not reach Google Drive: {e}") from e

        if data.startswith(b"%PDF"):
            return data
        if b"<html" in data[:500].lower() or b"<!doctype" in data[:500].lower():
            raise FileValidationError(
                "Google returned an HTML page instead of a PDF. The file is "
                "likely not shared as 'Anyone with the link can view', or it "
                "is too large (>25 MB) for direct download. Make the file "
                "public, or set LEXORA_DRIVE_MCP_CMD to use a Drive MCP server."
            )
        raise FileValidationError("Drive returned non-PDF data.")

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
        """Like extract_words, but also returns parse stats for UI feedback.

        Strict mode: every non-empty line must be a 'word - translation' pair.
        We reject the whole file if any line fails to match — this is a
        security gate, not a best-effort parser.
        """
        _validate_pairs(content)

        entries: List[Dict[str, str]] = []
        seen = set()
        total_lines = 0
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue
            total_lines += 1
            m = _SEPARATOR_RE.match(line)
            # _validate_pairs guarantees a match for every non-empty line.
            assert m is not None
            word = m.group("word").strip().rstrip(".,;")
            translation = m.group("translation").strip().rstrip(".,;")
            if not word or not translation:
                raise FileValidationError(
                    f"Empty word or translation in line: {line!r}"
                )
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
