import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const STATIC_SITE_BASE = "http://127.0.0.1:8080";
const HOME_HREF = `${STATIC_SITE_BASE}/index.html`;

export default function Header({ profile, setProfile, requestView, onSignOut, onAlert }) {
  return (
    <header className="header">
      <a className="brand" href={HOME_HREF} aria-label="Lexora home">Lexora</a>
      <UserMenu
        profile={profile}
        setProfile={setProfile}
        requestView={requestView}
        onSignOut={onSignOut}
        onAlert={onAlert}
      />
    </header>
  );
}

function UserMenu({ profile, setProfile, requestView, onSignOut, onAlert }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = profile?.name || profile?.email || "Lucy";
  const avatarUrl = profile?.avatar_url
    ? (profile.avatar_url.startsWith("http")
        ? profile.avatar_url
        : `http://127.0.0.1:8000${profile.avatar_url}`)
    : `${STATIC_SITE_BASE}/assets/favicon.svg`;

  const closeAnd = (fn) => () => { setOpen(false); fn?.(); };

  const goContinue = () => requestView?.("learn");
  const goHistory = () => requestView?.("history");
  const goChangePassword = () => {
    window.location.href = `${STATIC_SITE_BASE}/profile.html?action=change-password`;
  };
  const goDeleteAccount = () => {
    window.location.href = `${STATIC_SITE_BASE}/profile.html?action=delete-account`;
  };
  const goSignOut = () => {
    onSignOut?.();
    window.location.href = `${STATIC_SITE_BASE}/signin.html`;
  };

  const triggerUploadAvatar = () => fileRef.current?.click();

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      onAlert?.({ title: "Avatar too large", message: "Max 2 MB.", kind: "danger" });
      return;
    }
    try {
      const out = await api.uploadAvatar(file);
      setProfile?.({ ...(profile || {}), avatar_url: out.avatar_url });
    } catch (err) {
      onAlert?.({ title: "Could not upload avatar", message: err.message || String(err), kind: "danger" });
    }
  };

  return (
    <div className={`profile-menu ${open ? "is-open" : ""}`} ref={ref}>
      <button
        type="button"
        className="profile-menu__trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="profile-name">{name}</span>
        <span className="profile-avatar">
          <img src={avatarUrl} alt="" />
        </span>
      </button>
      <ul className="profile-menu__panel" role="menu">
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(triggerUploadAvatar)(); }}>
            <span className="dot dot--leaf" /> Upload avatar
          </a>
        </li>
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(goHistory)(); }}>
            <span className="dot dot--moss" /> History
          </a>
        </li>
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(goContinue)(); }}>
            <span className="dot dot--clay" /> Continue learning
          </a>
        </li>
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(goChangePassword)(); }}>
            <span className="dot dot--ink" /> Change password
          </a>
        </li>
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(goDeleteAccount)(); }}>
            <span className="dot dot--rust" /> Delete account
          </a>
        </li>
        <li role="separator" className="profile-menu__sep" />
        <li role="none">
          <a role="menuitem" href="#" onClick={(e) => { e.preventDefault(); closeAnd(goSignOut)(); }}>
            <span className="dot dot--rust" /> Sign out
          </a>
        </li>
      </ul>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={onAvatarChange}
      />
    </div>
  );
}
