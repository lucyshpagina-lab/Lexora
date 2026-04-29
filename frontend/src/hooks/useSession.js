import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";

const STORAGE_KEY = "lexora.session";

function readHashSession() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const userId = params.get("user_id");
  if (!userId) return null;
  return { user_id: userId };
}

export function useSession() {
  const [session, setSessionState] = useState(() => {
    const fromHash = readHashSession();
    if (fromHash) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fromHash)); } catch {}
      try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
      return fromHash;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setSession = useCallback((next) => {
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSessionState(next);
  }, []);

  const clearSession = useCallback(() => setSession(null), [setSession]);

  // On mount, validate that the stored session still exists on the server.
  useEffect(() => {
    if (!session) return;
    api.progress(session.user_id).catch(() => clearSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, setSession, clearSession };
}
