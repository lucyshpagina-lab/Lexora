import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";

const PROFILE_KEY = "lexora.profile";
const TOKEN_KEY = "lexora.token";

function readCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useProfile() {
  const [profile, setProfileState] = useState(readCachedProfile);

  const setProfile = useCallback((next) => {
    if (next) {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch {}
    } else {
      try { localStorage.removeItem(PROFILE_KEY); } catch {}
    }
    setProfileState(next);
  }, []);

  // If we have a token but no cached profile (typical on first arrival from
  // the static site), fetch /api/auth/me and cache the result.
  useEffect(() => {
    if (profile) return;
    const token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
    if (!token) return;
    let cancelled = false;
    api.me()
      .then((me) => { if (!cancelled) setProfile(me); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile, setProfile]);

  const signOut = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    try { localStorage.removeItem(PROFILE_KEY); } catch {}
    try { localStorage.removeItem("lexora.session"); } catch {}
    setProfileState(null);
  }, []);

  return { profile, setProfile, signOut };
}
