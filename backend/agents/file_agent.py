"""File Agent — upload, validation, parsing. Deterministic; no LLM calls."""

import io
import re
from pathlib import Path
from typing import List, Dict

from validators.file_validator import validate_file as _validate, FileValidationError


# Word-translation separators we recognize. Include en/em-dashes and tabs.
_SEPARATOR_RE = re.compile(
    r"^(?P<word>[^\t:=\-–—]{1,80}?)\s*[\t:=\-–—]+\s*(?P<translation>.{1,200})$"
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
        """MCP integration point for Google Drive.

        The Drive MCP server is invoked via a subprocess call expected to
        return the file's text on stdout. Configure with LEXORA_DRIVE_MCP
        (path to a script that takes a file_id and prints text), e.g.:

            export LEXORA_DRIVE_MCP=/path/to/drive_mcp_fetch.sh

        Without that var set, this returns a structured error so the UI can
        prompt the user to configure MCP.
        """
        import os
        import shlex
        import subprocess

        cmd = os.environ.get("LEXORA_DRIVE_MCP")
        if not cmd:
            raise FileValidationError(
                "Google Drive integration requires the Drive MCP server. "
                "Set LEXORA_DRIVE_MCP to the path of an executable that "
                "accepts a Drive file_id and writes the document text to stdout."
            )
        if not file_id or not file_id.strip():
            raise FileValidationError("Missing Drive file_id.")
        # Disallow shell metacharacters in file_id; Google file IDs are
        # alphanumeric + - _.
        if not all(c.isalnum() or c in "-_" for c in file_id):
            raise FileValidationError("Invalid Drive file_id.")

        try:
            result = subprocess.run(
                shlex.split(cmd) + [file_id],
                capture_output=True,
                timeout=30,
                text=True,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise FileValidationError(f"Drive MCP timed out: {e}") from e
        except FileNotFoundError as e:
            raise FileValidationError(
                f"Drive MCP command not found: {cmd}"
            ) from e
        if result.returncode != 0:
            raise FileValidationError(
                f"Drive MCP failed (rc={result.returncode}): "
                f"{(result.stderr or '').strip()[:300]}"
            )
        return result.stdout

    def read_local(self, filename: str, file_bytes: bytes) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return self.read_pdf_local(file_bytes)
        raise FileValidationError(f"Unsupported extension: {ext}")

    # -- Vocabulary extraction ---------------------------------------------

    def extract_words(self, content: str) -> List[Dict[str, str]]:
        """Parse 'word - translation' lines from extracted text.

        Recognized separators: ` - `, ` – `, ` — `, `:`, `=`, tab.
        Lines that don't match are skipped. Duplicates by word are dropped.
        """
        if not content or not content.strip():
            raise FileValidationError("Document is empty after extraction.")

        entries: List[Dict[str, str]] = []
        seen = set()
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue
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
        return entries
