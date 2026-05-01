"""HTTP-level tests for auth endpoints via FastAPI TestClient."""

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Isolate every test: fresh tmp DB + storage dir, mock email, no Anthropic.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("LEXORA_USERS_DB", str(tmp_path / "users.db"))
    monkeypatch.setenv("LEXORA_AVATARS_DIR", str(tmp_path / "avatars"))
    monkeypatch.setenv("LEXORA_EMAIL_PROVIDER", "mock")
    monkeypatch.chdir(tmp_path)

    import main as main_module
    importlib.reload(main_module)
    return main_module, TestClient(main_module.app)


def _signup(client, email="a@b.com", name="Lucy", password="hunter22"):
    # Default password is exactly 8 alphanumeric chars to satisfy the
    # server-side policy (^[A-Za-z0-9]{8}$).
    return client.post(
        "/api/auth/signup",
        json={"email": email, "name": name, "password": password},
    )


def _verify_via_peek(main_module, client, email):
    code = main_module.otp_store.peek(email)
    assert code is not None, "OTP was not stored"
    return client.post("/api/auth/verify-otp", json={"email": email, "code": code})


# -- signup ------------------------------------------------------------------


def test_signup_rejects_short_password(client):
    _, c = client
    r = c.post(
        "/api/auth/signup",
        json={"email": "x@y.com", "name": "X", "password": "abc12"},  # 5 chars
    )
    assert r.status_code == 422


def test_signup_rejects_special_chars_in_password(client):
    _, c = client
    r = c.post(
        "/api/auth/signup",
        json={"email": "x@y.com", "name": "X", "password": "abc!1234"},  # has '!'
    )
    assert r.status_code == 422


def test_signup_rejects_too_long_password(client):
    _, c = client
    r = c.post(
        "/api/auth/signup",
        json={"email": "x@y.com", "name": "X", "password": "abcdef123"},  # 9 chars
    )
    assert r.status_code == 422


def test_signup_creates_pending_user(client):
    main_module, c = client
    r = _signup(c)
    assert r.status_code == 200
    body = r.json()
    assert body["pending_email"] == "a@b.com"
    # In mock mode, the dev OTP code is exposed so the local UI can show it.
    assert "dev_code" in body
    assert body["dev_code"] == main_module.otp_store.peek("a@b.com")
    user = main_module.user_store.get("a@b.com")
    assert user is not None
    assert user["verified"] == 0


def test_signup_omits_dev_code_for_real_provider(monkeypatch, client):
    main_module, c = client
    monkeypatch.setenv("LEXORA_EMAIL_PROVIDER", "resend")
    # Don't actually call Resend — patch send_otp to a noop.
    monkeypatch.setattr(main_module.email_service, "send_otp", lambda *a, **kw: None)
    r = _signup(c, email="b@b.com")
    assert r.status_code == 200
    assert "dev_code" not in r.json()


def test_signup_normalises_email_case(client):
    main_module, c = client
    r = _signup(c, email="A@B.COM")
    assert r.json()["pending_email"] == "a@b.com"


def test_signup_rejects_invalid_email(client):
    _, c = client
    r = c.post(
        "/api/auth/signup", json={"email": "not-an-email", "name": "x", "password": "hunter22"}
    )
    assert r.status_code == 400


def test_signup_rejects_short_password(client):
    _, c = client
    r = c.post(
        "/api/auth/signup", json={"email": "a@b.com", "name": "x", "password": "1234"}
    )
    assert r.status_code == 422  # pydantic validation


def test_signup_existing_verified_returns_409(client):
    main_module, c = client
    _signup(c)
    _verify_via_peek(main_module, c, "a@b.com")
    r = _signup(c)
    assert r.status_code == 409


def test_signup_existing_unverified_reissues_otp(client):
    main_module, c = client
    _signup(c)
    first_code = main_module.otp_store.peek("a@b.com")
    r = _signup(c)  # same email, not yet verified
    assert r.status_code == 200
    second_code = main_module.otp_store.peek("a@b.com")
    assert second_code != first_code  # new code was issued


# -- verify-otp --------------------------------------------------------------


def test_verify_otp_success_returns_jwt(client):
    main_module, c = client
    _signup(c)
    r = _verify_via_peek(main_module, c, "a@b.com")
    assert r.status_code == 200
    body = r.json()
    assert "token" in body and len(body["token"]) > 20
    assert body["user"]["verified"] is True


def test_verify_otp_wrong_code_fails(client):
    main_module, c = client
    _signup(c)
    r = c.post("/api/auth/verify-otp", json={"email": "a@b.com", "code": "000000"})
    assert r.status_code == 400


def test_verify_otp_consumes_code(client):
    main_module, c = client
    _signup(c)
    code = main_module.otp_store.peek("a@b.com")
    c.post("/api/auth/verify-otp", json={"email": "a@b.com", "code": code})
    # Second attempt with same code → fails (consumed).
    r = c.post("/api/auth/verify-otp", json={"email": "a@b.com", "code": code})
    assert r.status_code == 400


# -- signin ------------------------------------------------------------------


def test_signin_after_verification(client):
    main_module, c = client
    _signup(c)
    _verify_via_peek(main_module, c, "a@b.com")
    r = c.post(
        "/api/auth/signin", json={"email": "a@b.com", "password": "hunter22"}
    )
    assert r.status_code == 200
    assert "token" in r.json()


def test_signin_unverified_returns_403(client):
    main_module, c = client
    _signup(c)
    r = c.post(
        "/api/auth/signin", json={"email": "a@b.com", "password": "hunter22"}
    )
    assert r.status_code == 403


def test_signin_wrong_password_returns_401(client):
    main_module, c = client
    _signup(c)
    _verify_via_peek(main_module, c, "a@b.com")
    r = c.post(
        "/api/auth/signin", json={"email": "a@b.com", "password": "wrong-pwd"}
    )
    assert r.status_code == 401


def test_signin_nonexistent_account_returns_401(client):
    _, c = client
    r = c.post(
        "/api/auth/signin", json={"email": "nobody@x.com", "password": "whatever"}
    )
    assert r.status_code == 401


# -- me / change-password / delete -------------------------------------------


def _auth_headers(client, main_module, c):
    _signup(c)
    r = _verify_via_peek(main_module, c, "a@b.com")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_me_returns_current_user(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    r = c.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "a@b.com"
    assert body["name"] == "Lucy"


def test_me_without_token_returns_401(client):
    _, c = client
    assert c.get("/api/auth/me").status_code == 401


def test_change_password_flow(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    r = c.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": "hunter22", "new_password": "newpass8"},
    )
    assert r.status_code == 200
    # Old password should fail now.
    r1 = c.post("/api/auth/signin", json={"email": "a@b.com", "password": "hunter22"})
    assert r1.status_code == 401
    # New password works.
    r2 = c.post("/api/auth/signin", json={"email": "a@b.com", "password": "newpass8"})
    assert r2.status_code == 200


def test_change_password_wrong_old_returns_400(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    r = c.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": "wrong", "new_password": "newpass8"},
    )
    assert r.status_code == 400


def test_delete_account(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    assert c.delete("/api/auth/me", headers=headers).status_code == 200
    assert main_module.user_store.get("a@b.com") is None


# -- avatar ------------------------------------------------------------------


def test_upload_avatar(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    files = {"file": ("avatar.png", b"\x89PNG fake", "image/png")}
    r = c.post("/api/auth/avatar", headers=headers, files=files)
    assert r.status_code == 200
    assert r.json()["avatar_url"] == "/api/auth/avatar/a@b.com"
    user = main_module.user_store.get("a@b.com")
    assert user["avatar_path"] is not None  # internal field still set
    # GET endpoint should now serve the file.
    g = c.get("/api/auth/avatar/a@b.com")
    assert g.status_code == 200
    assert g.content == b"\x89PNG fake"


def test_get_avatar_404_when_missing(client):
    _, c = client
    r = c.get("/api/auth/avatar/nobody@x.com")
    assert r.status_code == 404


def test_me_returns_avatar_url_when_set(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    files = {"file": ("avatar.png", b"\x89PNG", "image/png")}
    c.post("/api/auth/avatar", headers=headers, files=files)
    me = c.get("/api/auth/me", headers=headers).json()
    assert me["avatar_url"] == "/api/auth/avatar/a@b.com"


def test_upload_avatar_rejects_non_image(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    files = {"file": ("doc.pdf", b"%PDF", "application/pdf")}
    r = c.post("/api/auth/avatar", headers=headers, files=files)
    assert r.status_code == 400


def test_upload_avatar_requires_auth(client):
    _, c = client
    files = {"file": ("avatar.png", b"x", "image/png")}
    assert c.post("/api/auth/avatar", files=files).status_code == 401


# -- language preferences ----------------------------------------------------


def test_set_preferred_language(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    r = c.post("/api/auth/language", headers=headers, json={"language": "Spanish"})
    assert r.status_code == 200
    assert r.json()["preferred_language"] == "Spanish"


def test_add_custom_language(client):
    main_module, c = client
    headers = _auth_headers(client, main_module, c)
    r = c.post(
        "/api/auth/language/custom", headers=headers, json={"language": "Sindarin"}
    )
    assert r.status_code == 200
    assert "Sindarin" in r.json()["custom_languages"]
    me = c.get("/api/auth/me", headers=headers).json()
    assert "Sindarin" in me["custom_languages"]
