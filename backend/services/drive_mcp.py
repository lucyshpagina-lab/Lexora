"""Minimal stdio MCP client for Google Drive integrations.

Spawns an MCP server (configured via LEXORA_DRIVE_MCP_CMD), performs the
JSON-RPC handshake, and calls the configured tool to download a file by id.

Env vars
--------
LEXORA_DRIVE_MCP_CMD       Required. Command to launch the MCP server, e.g.
                           ``npx -y @isaacphi/mcp-gdrive`` or
                           ``uvx mcp-server-google-drive``.
LEXORA_DRIVE_MCP_TOOL      Tool name to invoke (default: ``gdrive_read_file``).
LEXORA_DRIVE_MCP_FILE_ARG  Name of the argument carrying the file id
                           (default: ``file_id``).
LEXORA_DRIVE_MCP_TIMEOUT   Per-request timeout in seconds (default: 60).

Response handling
-----------------
A successful ``tools/call`` returns ``content`` as a list of items. We accept:
  * ``{"type": "text", "text": "..."}`` — used as PDF text directly.
  * ``{"type": "resource", "resource": {"blob": "<base64>", ...}}`` — decoded
    as raw PDF bytes.
  * ``{"type": "image", "data": "<base64>"}`` — decoded as raw bytes.
"""

from __future__ import annotations

import base64
import json
import os
import shlex
import subprocess
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union


PROTOCOL_VERSION = "2024-11-05"


@dataclass
class DriveResult:
    """Either extracted text or raw bytes (e.g. a downloaded PDF)."""
    text: Optional[str] = None
    pdf_bytes: Optional[bytes] = None


class DriveMCPError(RuntimeError):
    pass


def _configured_cmd() -> Optional[List[str]]:
    raw = os.environ.get("LEXORA_DRIVE_MCP_CMD")
    if not raw or not raw.strip():
        return None
    return shlex.split(raw)


def is_configured() -> bool:
    return _configured_cmd() is not None


def fetch_drive_file(file_id: str) -> DriveResult:
    """Download a Drive file via the configured MCP server."""
    cmd = _configured_cmd()
    if cmd is None:
        raise DriveMCPError(
            "Google Drive MCP is not configured. Set LEXORA_DRIVE_MCP_CMD "
            "to the command that launches your Drive MCP server "
            "(e.g. 'npx -y @isaacphi/mcp-gdrive')."
        )
    if not file_id or not file_id.strip():
        raise DriveMCPError("Missing Drive file_id.")
    if not all(c.isalnum() or c in "-_" for c in file_id):
        raise DriveMCPError("Invalid Drive file_id.")

    tool_name = os.environ.get("LEXORA_DRIVE_MCP_TOOL", "gdrive_read_file")
    file_arg = os.environ.get("LEXORA_DRIVE_MCP_FILE_ARG", "file_id")
    timeout = float(os.environ.get("LEXORA_DRIVE_MCP_TIMEOUT", "60"))

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
    except FileNotFoundError as e:
        raise DriveMCPError(f"MCP command not found: {cmd[0]}") from e

    client = _StdioClient(proc, timeout=timeout)
    try:
        client.initialize()
        result = client.call_tool(tool_name, {file_arg: file_id})
    finally:
        client.close()

    return _content_to_result(result.get("content", []))


def _content_to_result(content: List[Dict[str, Any]]) -> DriveResult:
    text_parts: List[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "text" and isinstance(item.get("text"), str):
            text_parts.append(item["text"])
        elif kind == "image" and isinstance(item.get("data"), str):
            try:
                return DriveResult(pdf_bytes=base64.b64decode(item["data"]))
            except (ValueError, TypeError) as e:
                raise DriveMCPError(f"Bad base64 image content: {e}") from e
        elif kind == "resource":
            res = item.get("resource") or {}
            blob = res.get("blob")
            if isinstance(blob, str):
                try:
                    return DriveResult(pdf_bytes=base64.b64decode(blob))
                except (ValueError, TypeError) as e:
                    raise DriveMCPError(f"Bad base64 resource blob: {e}") from e
            inner = res.get("text")
            if isinstance(inner, str):
                text_parts.append(inner)
    if text_parts:
        return DriveResult(text="\n".join(text_parts))
    raise DriveMCPError("MCP server returned no usable content.")


class _StdioClient:
    """Tiny JSON-RPC 2.0 client over a child process's stdio."""

    def __init__(self, proc: subprocess.Popen, timeout: float):
        self.proc = proc
        self.timeout = timeout
        self._next_id = 0
        self._lock = threading.Lock()

    def _send(self, payload: Dict[str, Any]) -> None:
        line = json.dumps(payload).encode("utf-8") + b"\n"
        assert self.proc.stdin is not None
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def _recv(self) -> Dict[str, Any]:
        assert self.proc.stdout is not None
        # Read until we get a JSON-RPC response (skip notifications/logs).
        deadline_iters = 200
        for _ in range(deadline_iters):
            raw = self.proc.stdout.readline()
            if not raw:
                stderr = b""
                if self.proc.stderr is not None:
                    try:
                        stderr = self.proc.stderr.read() or b""
                    except Exception:
                        pass
                raise DriveMCPError(
                    f"MCP server exited unexpectedly. "
                    f"stderr: {stderr.decode('utf-8', 'replace')[:500]}"
                )
            try:
                msg = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict) and "id" in msg:
                return msg
        raise DriveMCPError("Did not receive a JSON-RPC response.")

    def _request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            self._next_id += 1
            req_id = self._next_id
            self._send({
                "jsonrpc": "2.0",
                "id": req_id,
                "method": method,
                "params": params,
            })

            # Watchdog: kill the proc if it hangs past timeout.
            timer = threading.Timer(self.timeout, self._kill)
            timer.daemon = True
            timer.start()
            try:
                msg = self._recv()
            finally:
                timer.cancel()

            if "error" in msg:
                err = msg["error"]
                raise DriveMCPError(
                    f"MCP error {err.get('code', '?')}: {err.get('message', '?')}"
                )
            return msg.get("result", {})

    def _notify(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
        payload: Dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            payload["params"] = params
        with self._lock:
            self._send(payload)

    def initialize(self) -> None:
        self._request("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "lexora", "version": "0.1.0"},
        })
        self._notify("notifications/initialized")

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        result = self._request("tools/call", {
            "name": name,
            "arguments": arguments,
        })
        if result.get("isError"):
            text = ""
            for item in result.get("content", []):
                if isinstance(item, dict) and item.get("type") == "text":
                    text += item.get("text", "")
            raise DriveMCPError(f"MCP tool returned error: {text or '(no detail)'}")
        return result

    def _kill(self) -> None:
        try:
            self.proc.kill()
        except Exception:
            pass

    def close(self) -> None:
        try:
            if self.proc.stdin is not None:
                self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=2)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
