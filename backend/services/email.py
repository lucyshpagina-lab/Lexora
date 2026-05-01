"""Email dispatcher. Mock by default, Resend HTTP API when configured.

Switch with LEXORA_EMAIL_PROVIDER=resend (requires LEXORA_RESEND_API_KEY).
"""

import json
import os
import sys
import urllib.error
import urllib.request


def current_provider() -> str:
    return os.environ.get("LEXORA_EMAIL_PROVIDER", "mock").lower()


def send_otp(email: str, code: str) -> None:
    if current_provider() == "resend":
        _send_via_resend(email, code)
    else:
        _send_mock(email, code)


def _send_mock(email: str, code: str) -> None:
    """Print to stderr so dev can read the code from backend logs."""
    print(f"[lexora-mock-email] to={email} code={code} (10 min TTL)", file=sys.stderr)
    sys.stderr.flush()


def _send_via_resend(email: str, code: str) -> None:
    api_key = os.environ.get("LEXORA_RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("LEXORA_RESEND_API_KEY not set")
    sender = os.environ.get("LEXORA_EMAIL_FROM", "noreply@lexora.app")
    body = json.dumps(
        {
            "from": sender,
            "to": [email],
            "subject": "Your Lexora confirmation code",
            "text": (
                f"Your Lexora confirmation code is: {code}\n\n"
                "It will expire in 10 minutes."
            ),
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare in front of Resend rejects Python's default urllib UA
            # with code 1010. Use a vanilla-looking UA so the request goes through.
            "User-Agent": "lexora/1.0 (+https://github.com/lucyshpagina-lab/Lexora)",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Resend API failed: {resp.status}")
    except urllib.error.HTTPError as e:
        body_preview = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Resend API failed: {e.code} {body_preview}") from e
