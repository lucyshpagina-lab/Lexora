"""Tests for the stdio MCP client used by the Drive integration."""

import base64
import shlex
import sys
import textwrap

import pytest


def _mcp_cmd_for(script_path) -> str:
    """Build an LEXORA_DRIVE_MCP_CMD that survives spaces in paths."""
    return f"{shlex.quote(sys.executable)} {shlex.quote(str(script_path))}"

from services import drive_mcp
from services.drive_mcp import (
    DriveMCPError,
    DriveResult,
    _content_to_result,
    fetch_drive_file,
    is_configured,
)


# -- env / config ----------------------------------------------------------


def test_is_configured_reads_env(monkeypatch):
    monkeypatch.delenv("LEXORA_DRIVE_MCP_CMD", raising=False)
    assert is_configured() is False
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", "echo")
    assert is_configured() is True
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", "   ")
    assert is_configured() is False


def test_fetch_without_env_raises(monkeypatch):
    monkeypatch.delenv("LEXORA_DRIVE_MCP_CMD", raising=False)
    with pytest.raises(DriveMCPError, match="not configured"):
        fetch_drive_file("abc")


def test_fetch_rejects_empty_id(monkeypatch):
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", "echo")
    with pytest.raises(DriveMCPError, match="Missing"):
        fetch_drive_file("   ")


def test_fetch_rejects_id_with_metacharacters(monkeypatch):
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", "echo")
    with pytest.raises(DriveMCPError, match="Invalid"):
        fetch_drive_file("abc;rm -rf /")


def test_fetch_unknown_command_raises(monkeypatch):
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", "/no/such/binary-xyz123")
    with pytest.raises(DriveMCPError, match="not found"):
        fetch_drive_file("abc123")


# -- _content_to_result ----------------------------------------------------


def test_content_to_result_text_items_concatenated():
    res = _content_to_result([
        {"type": "text", "text": "hola - hello"},
        {"type": "text", "text": "adios - goodbye"},
    ])
    assert isinstance(res, DriveResult)
    assert res.pdf_bytes is None
    assert res.text == "hola - hello\nadios - goodbye"


def test_content_to_result_image_returns_bytes():
    pdf = b"%PDF-1.4 fake binary"
    payload = base64.b64encode(pdf).decode("ascii")
    res = _content_to_result([{"type": "image", "data": payload}])
    assert res.text is None
    assert res.pdf_bytes == pdf


def test_content_to_result_resource_blob_returns_bytes():
    pdf = b"%PDF-1.4 also fake"
    payload = base64.b64encode(pdf).decode("ascii")
    res = _content_to_result([
        {"type": "resource", "resource": {"blob": payload, "mimeType": "application/pdf"}},
    ])
    assert res.pdf_bytes == pdf


def test_content_to_result_resource_text_falls_back():
    res = _content_to_result([
        {"type": "resource", "resource": {"text": "uno - one\ndos - two"}},
    ])
    assert res.text == "uno - one\ndos - two"


def test_content_to_result_empty_raises():
    with pytest.raises(DriveMCPError, match="no usable"):
        _content_to_result([])


def test_content_to_result_bad_base64_raises():
    with pytest.raises(DriveMCPError, match="base64"):
        _content_to_result([{"type": "image", "data": "not base 64 ###"}])


# -- end-to-end with a mock MCP server -------------------------------------


def _write_fake_mcp(tmp_path, body: str):
    """Write a tiny Python script that speaks JSON-RPC like an MCP server."""
    script = tmp_path / "fake_mcp_server.py"
    script.write_text(body)
    return script


_FAKE_MCP_TEMPLATE = textwrap.dedent(
    """
    import json
    import sys

    OUTPUT = {output_repr}

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        mid = msg.get("id")
        method = msg.get("method")
        if mid is None:
            # notification — no response
            continue
        if method == "initialize":
            sys.stdout.write(json.dumps({{
                "jsonrpc": "2.0", "id": mid,
                "result": {{
                    "protocolVersion": "2024-11-05",
                    "capabilities": {{}},
                    "serverInfo": {{"name": "fake", "version": "0"}},
                }},
            }}) + "\\n")
            sys.stdout.flush()
        elif method == "tools/call":
            sys.stdout.write(json.dumps({{
                "jsonrpc": "2.0", "id": mid,
                "result": OUTPUT,
            }}) + "\\n")
            sys.stdout.flush()
        else:
            sys.stdout.write(json.dumps({{
                "jsonrpc": "2.0", "id": mid,
                "error": {{"code": -32601, "message": "method not found"}},
            }}) + "\\n")
            sys.stdout.flush()
    """
)


def test_fetch_drive_file_end_to_end_text(tmp_path, monkeypatch):
    """Full handshake: client initialises, calls tool, gets text back."""
    output = {"content": [{"type": "text", "text": "voiture - car\nfleur - flower"}]}
    script = _write_fake_mcp(tmp_path, _FAKE_MCP_TEMPLATE.format(output_repr=repr(output)))
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", _mcp_cmd_for(script))

    res = fetch_drive_file("abc123ABC_xyz")
    assert res.text == "voiture - car\nfleur - flower"
    assert res.pdf_bytes is None


def test_fetch_drive_file_end_to_end_base64_pdf(tmp_path, monkeypatch):
    pdf = b"%PDF-1.4 placeholder bytes"
    output = {"content": [{
        "type": "resource",
        "resource": {"blob": base64.b64encode(pdf).decode("ascii"), "mimeType": "application/pdf"},
    }]}
    script = _write_fake_mcp(tmp_path, _FAKE_MCP_TEMPLATE.format(output_repr=repr(output)))
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", _mcp_cmd_for(script))

    res = fetch_drive_file("abc123ABC_xyz")
    assert res.pdf_bytes == pdf


def test_fetch_drive_file_propagates_server_error(tmp_path, monkeypatch):
    """If the MCP server replies with a JSON-RPC error, the client raises."""
    error_body = textwrap.dedent("""
        import json, sys
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue
            mid = msg.get("id")
            method = msg.get("method")
            if mid is None:
                continue
            if method == "initialize":
                sys.stdout.write(json.dumps({
                    "jsonrpc": "2.0", "id": mid,
                    "result": {"protocolVersion": "2024-11-05", "capabilities": {}, "serverInfo": {"name": "fake", "version": "0"}},
                }) + "\\n"); sys.stdout.flush()
            else:
                sys.stdout.write(json.dumps({
                    "jsonrpc": "2.0", "id": mid,
                    "error": {"code": -32000, "message": "permission denied"},
                }) + "\\n"); sys.stdout.flush()
        """)
    script = _write_fake_mcp(tmp_path, error_body)
    monkeypatch.setenv("LEXORA_DRIVE_MCP_CMD", _mcp_cmd_for(script))
    with pytest.raises(DriveMCPError, match="permission denied"):
        fetch_drive_file("abc123ABC_xyz")
