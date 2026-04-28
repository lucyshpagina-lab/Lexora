// Lexora lib — pure helpers and storage factories. Loaded on every page that
// needs them (and by the browser test runner), so they're independently testable.
(() => {
  'use strict';
  window.Lexora = window.Lexora || {};

  // ---- vocabulary file parser -------------------------------------------------
  // Recognised separators: ' - ', ' – ', ' — ', ' = ', ' / ', tab, ':' (with space after)
  // Lines starting with '#' or empty lines are skipped.
  Lexora.parseDeckText = (text) => {
    const lines = String(text == null ? '' : text).split(/\r?\n/);
    const out = [];
    const sepRe = /\s+[-–—=]\s+|\s+\/\s+|\s*:\s+|\t/;
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const m = line.split(sepRe);
      if (m.length < 2) return;
      const term = m[0].trim();
      const translation = m.slice(1).join(' — ').trim();
      if (term && translation) out.push({ term, translation });
    });
    return out;
  };

  // ---- non-cryptographic hash (used to avoid storing raw passwords) -----------
  Lexora.hash = (s) => {
    let h = 5381;
    const str = String(s == null ? '' : s);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  // ---- email/password validators ---------------------------------------------
  Lexora.isValidEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
  Lexora.isValidPassword = (s) => typeof s === 'string' && s.length >= 8;

  // ---- random id (testable: uses crypto.randomUUID when available) -----------
  Lexora.uuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  };

  // ---- date helpers used by the streak counter -------------------------------
  Lexora.today = () => new Date().toISOString().slice(0, 10);
  Lexora.yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  // ---- deck factory (per-user vocabulary store) ------------------------------
  Lexora.makeDeck = (prefix) => {
    const key = (lang) => `lexora.deck.${prefix}.${lang}`;
    const norm = (c) => `${String(c.term || '').toLowerCase()}|${String(c.translation || '').toLowerCase()}`;
    const api = {
      get(lang) {
        try { return JSON.parse(localStorage.getItem(key(lang)) || '[]'); } catch { return []; }
      },
      save(lang, cards) { localStorage.setItem(key(lang), JSON.stringify(cards)); },
      add(lang, newCards) {
        const existing = api.get(lang);
        const seen = new Set(existing.map(norm));
        const fresh = [];
        (newCards || []).forEach((c) => {
          if (!c || !c.term || !c.translation) return;
          const k = norm(c);
          if (seen.has(k)) return;
          fresh.push({ term: c.term, translation: c.translation, id: Lexora.uuid(), reviews: 0, due: 0, score: 0 });
          seen.add(k);
        });
        api.save(lang, existing.concat(fresh));
        return fresh.length;
      },
      clear(lang) { localStorage.removeItem(key(lang)); },
      count(lang) { return api.get(lang).length; },
    };
    return api;
  };

  // ---- stats factory (review counters + day streak) --------------------------
  Lexora.makeStats = (prefix) => {
    const key = `lexora.stats.${prefix}`;
    const empty = () => ({ reviews: 0, correct: 0, sessions: 0, streak: 0, lastDay: '' });
    const api = {
      get() {
        try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(empty())); } catch { return empty(); }
      },
      save(s) { localStorage.setItem(key, JSON.stringify(s)); },
      review(correct) {
        const s = api.get();
        s.reviews += 1;
        if (correct) s.correct += 1;
        const t = Lexora.today();
        if (s.lastDay !== t) {
          s.streak = (s.lastDay === Lexora.yesterday()) ? s.streak + 1 : 1;
          s.lastDay = t;
        }
        api.save(s);
        return s;
      },
      session() { const s = api.get(); s.sessions += 1; api.save(s); return s; },
      reset() { localStorage.removeItem(key); },
    };
    return api;
  };

  // ---- prefs factory (lang/level/category UI prefs) --------------------------
  Lexora.makePrefs = (prefix) => {
    const key = `lexora.prefs.${prefix}`;
    const empty = () => ({ lang: 'en', level: 'all', category: 'all' });
    return {
      get() {
        try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(empty())); } catch { return empty(); }
      },
      save(p) { localStorage.setItem(key, JSON.stringify(p)); },
      reset() { localStorage.removeItem(key); },
    };
  };

  // ---- topic filter (pure — used by topics.html) -----------------------------
  Lexora.filterTopics = (flat, { lang, level, category, q } = {}) => {
    const needle = String(q || '').trim().toLowerCase();
    return (flat || []).filter((t) =>
      (!lang || t.lang === lang) &&
      (!level || level === 'all' || t.level === level) &&
      (!category || category === 'all' || t.category === category) &&
      (!needle || (t.title + ' ' + (t.items || []).join(' ')).toLowerCase().includes(needle))
    );
  };
})();
