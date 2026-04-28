"""Thin wrapper around the Anthropic SDK with a mock fallback."""

import os
from typing import Optional

from .mock import mock_response


DEFAULT_MODEL = "claude-opus-4-7"


class LLMClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model or os.environ.get("LEXORA_MODEL", DEFAULT_MODEL)
        self._client = None
        if self.api_key:
            try:
                from anthropic import Anthropic
                self._client = Anthropic(api_key=self.api_key)
            except ImportError:
                self._client = None

    @property
    def is_live(self) -> bool:
        return self._client is not None

    def complete(self, prompt: str, max_tokens: int = 4000) -> str:
        if self._client is None:
            return mock_response(prompt)
        msg = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = []
        for block in msg.content:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        return "".join(parts).strip()
