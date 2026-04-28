"""Unit tests for password hashing + JWT helpers."""

import os
import time

import pytest

from services import auth as auth_service


def test_hash_and_verify_password():
    h = auth_service.hash_password("hunter2")
    assert auth_service.verify_password("hunter2", h) is True
    assert auth_service.verify_password("hunter3", h) is False


def test_hash_password_uniqueness():
    # bcrypt salt → different hashes each call, both valid.
    h1 = auth_service.hash_password("same-password")
    h2 = auth_service.hash_password("same-password")
    assert h1 != h2
    assert auth_service.verify_password("same-password", h1) is True
    assert auth_service.verify_password("same-password", h2) is True


def test_verify_password_handles_garbage_hash():
    assert auth_service.verify_password("x", "not-a-hash") is False
    assert auth_service.verify_password("x", "") is False


def test_jwt_round_trip():
    token = auth_service.issue_jwt("a@b.com")
    assert isinstance(token, str)
    assert auth_service.verify_jwt(token) == "a@b.com"


def test_jwt_invalid_token_returns_none():
    assert auth_service.verify_jwt("not.a.token") is None
    assert auth_service.verify_jwt("") is None


def test_jwt_signed_with_other_secret_rejected(monkeypatch):
    import jwt

    bad = jwt.encode(
        {"sub": "a@b.com"},
        "some-other-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
    )
    assert auth_service.verify_jwt(bad) is None


def test_get_current_user_email_dependency_missing_header():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        auth_service.get_current_user_email(authorization=None)
    assert exc.value.status_code == 401


def test_get_current_user_email_dependency_invalid_format():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        auth_service.get_current_user_email(authorization="Token abc")
    assert exc.value.status_code == 401


def test_get_current_user_email_dependency_valid():
    token = auth_service.issue_jwt("user@example.com")
    assert (
        auth_service.get_current_user_email(authorization=f"Bearer {token}")
        == "user@example.com"
    )
