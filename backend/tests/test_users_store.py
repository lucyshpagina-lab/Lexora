"""Unit tests for SQLite UserStore + OTPStore."""

import time

import pytest

from services.users import OTPStore, UserStore


@pytest.fixture
def store(tmp_path):
    return UserStore(db_path=str(tmp_path / "users.db"))


@pytest.fixture
def otp(store):
    return OTPStore(store)


# -- UserStore ---------------------------------------------------------------


def test_create_and_get(store):
    assert store.create("a@b.com", "Lucy", "hash1") is True
    u = store.get("a@b.com")
    assert u["email"] == "a@b.com"
    assert u["name"] == "Lucy"
    assert u["password_hash"] == "hash1"
    assert u["verified"] == 0
    assert u["custom_languages"] == "[]"


def test_create_duplicate_returns_false(store):
    store.create("a@b.com", "L", "h")
    assert store.create("a@b.com", "Other", "h2") is False


def test_get_missing_returns_none(store):
    assert store.get("nope@x.com") is None


def test_mark_verified(store):
    store.create("a@b.com", "L", "h")
    store.mark_verified("a@b.com")
    assert store.get("a@b.com")["verified"] == 1


def test_update_password(store):
    store.create("a@b.com", "L", "h")
    store.update_password("a@b.com", "h2")
    assert store.get("a@b.com")["password_hash"] == "h2"


def test_set_avatar(store):
    store.create("a@b.com", "L", "h")
    store.set_avatar("a@b.com", "/path/to/avatar.png")
    assert store.get("a@b.com")["avatar_path"] == "/path/to/avatar.png"


def test_set_preferred_language(store):
    store.create("a@b.com", "L", "h")
    store.set_preferred_language("a@b.com", "Spanish")
    assert store.get("a@b.com")["preferred_language"] == "Spanish"


def test_add_custom_language_dedupes(store):
    store.create("a@b.com", "L", "h")
    store.add_custom_language("a@b.com", "Klingon")
    store.add_custom_language("a@b.com", "Klingon")  # duplicate
    store.add_custom_language("a@b.com", "Sindarin")
    import json
    langs = json.loads(store.get("a@b.com")["custom_languages"])
    assert langs == ["Klingon", "Sindarin"]


def test_delete_cascades_to_otp(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456")
    store.delete("a@b.com")
    assert store.get("a@b.com") is None
    assert otp.peek("a@b.com") is None


# -- OTPStore ----------------------------------------------------------------


def test_otp_create_and_verify(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456")
    assert otp.verify("a@b.com", "123456") is True


def test_otp_verify_consumes_code(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456")
    otp.verify("a@b.com", "123456")
    # Second verify should fail because code was consumed.
    assert otp.verify("a@b.com", "123456") is False


def test_otp_wrong_code_increments_attempts(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456")
    assert otp.verify("a@b.com", "999999") is False
    assert otp.verify("a@b.com", "999998") is False
    # Correct code should still work within attempt limit.
    assert otp.verify("a@b.com", "123456") is True


def test_otp_too_many_attempts_invalidates(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456")
    for _ in range(OTPStore.MAX_ATTEMPTS):
        otp.verify("a@b.com", "wrong")
    # Now the code is gone — even the correct one fails.
    assert otp.verify("a@b.com", "123456") is False


def test_otp_expired(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "123456", ttl_seconds=-1)  # already expired
    assert otp.verify("a@b.com", "123456") is False


def test_otp_create_replaces_existing(store, otp):
    store.create("a@b.com", "L", "h")
    otp.create("a@b.com", "111111")
    otp.create("a@b.com", "222222")
    assert otp.verify("a@b.com", "111111") is False
    # Re-create one more time since previous verify consumed nothing
    otp.create("a@b.com", "222222")
    assert otp.verify("a@b.com", "222222") is True


def test_otp_verify_unknown_email(store, otp):
    assert otp.verify("nobody@x.com", "anything") is False
