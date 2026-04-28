// Lexora — backend API client. Reads/writes JWT to localStorage and exposes a
// thin fetch wrapper used by auth.js, profile.js, and any future pages.
(() => {
  'use strict';
  window.Lexora = window.Lexora || {};

  // Default to local FastAPI in dev. Override by setting window.LEXORA_API
  // before this script loads (e.g. an env-injected meta tag).
  const DEFAULT_API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : '';
  const API_BASE = (typeof window.LEXORA_API === 'string') ? window.LEXORA_API : DEFAULT_API;
  Lexora.apiBase = API_BASE;
  Lexora.absoluteApiUrl = (path) => path && path.startsWith('/') ? (API_BASE + path) : path;

  const KEY_TOKEN = 'lexora.token';
  const KEY_PROFILE = 'lexora.profile';
  const KEY_REMEMBER_EMAIL = 'lexora.remember.email';

  // Token + profile persistence honours a "remember me" choice:
  //   set(t, true)  → localStorage (survives browser restart)
  //   set(t, false) → sessionStorage (cleared on tab close)
  // get() checks both, prefers localStorage. clear() wipes both.
  Lexora.token = {
    get: () => localStorage.getItem(KEY_TOKEN) || sessionStorage.getItem(KEY_TOKEN) || null,
    set: (t, persistent = true) => {
      sessionStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_TOKEN);
      (persistent ? localStorage : sessionStorage).setItem(KEY_TOKEN, t);
    },
    clear: () => {
      localStorage.removeItem(KEY_TOKEN);
      sessionStorage.removeItem(KEY_TOKEN);
    },
  };

  Lexora.profile = {
    get: () => {
      const raw = localStorage.getItem(KEY_PROFILE) || sessionStorage.getItem(KEY_PROFILE);
      try { return JSON.parse(raw || 'null'); } catch { return null; }
    },
    set: (p, persistent = true) => {
      const raw = JSON.stringify(p);
      sessionStorage.removeItem(KEY_PROFILE);
      localStorage.removeItem(KEY_PROFILE);
      (persistent ? localStorage : sessionStorage).setItem(KEY_PROFILE, raw);
    },
    clear: () => {
      localStorage.removeItem(KEY_PROFILE);
      sessionStorage.removeItem(KEY_PROFILE);
    },
  };

  Lexora.rememberedEmail = {
    get: () => localStorage.getItem(KEY_REMEMBER_EMAIL) || '',
    set: (e) => localStorage.setItem(KEY_REMEMBER_EMAIL, e),
    clear: () => localStorage.removeItem(KEY_REMEMBER_EMAIL),
  };

  Lexora.api = async (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const token = Lexora.token.get();
    if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;

    const url = API_BASE + path;
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
      body = JSON.stringify(body);
    }

    let resp;
    try {
      resp = await fetch(url, { method: opts.method || 'GET', headers, body });
    } catch (e) {
      const err = new Error('Network error: ' + (e.message || e));
      err.network = true;
      throw err;
    }
    let data = null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await resp.json(); } catch { data = null; }
    } else {
      try { data = await resp.text(); } catch { data = null; }
    }
    if (!resp.ok) {
      const message = (data && data.detail) || `HTTP ${resp.status}`;
      const err = new Error(message);
      err.status = resp.status;
      err.body = data;
      throw err;
    }
    return data;
  };

  // Convenience: enforce auth on protected pages. Call from each page's script.
  Lexora.requireAuthOrRedirect = (target = 'signin.html') => {
    if (!Lexora.token.get()) { location.href = target; return null; }
    return Lexora.profile.get();
  };

  Lexora.signOut = () => {
    Lexora.token.clear();
    Lexora.profile.clear();
    location.href = 'signin.html';
  };
})();
