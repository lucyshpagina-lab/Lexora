import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";

const STORAGE_KEY = "lexora.session";

export function useSession() {
  const [session, setSessionState] = useState(() => {
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
