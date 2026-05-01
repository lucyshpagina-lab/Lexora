import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function formatDate(unixSec) {
  const d = new Date(unixSec * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export default function History({ onRestore }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  // Cache lazily-loaded words per upload id so re-opening doesn't refetch.
  const [wordsById, setWordsById] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.history()
      .then((d) => { if (!cancelled) setItems(d.items); })
      .catch((e) => !cancelled && setError(e.message || String(e)));
    return () => { cancelled = true; };
  }, []);

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (wordsById[id]) return;
    setLoadingId(id);
    try {
      const entry = await api.historyEntry(id);
      setWordsById((prev) => ({ ...prev, [id]: entry.vocabulary }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoadingId(null);
    }
  };

  const restore = async (id) => {
    setRestoringId(id);
    try {
      const session = await api.historyRestore(id);
      onRestore?.(session);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRestoringId(null);
    }
  };

  if (error) {
    return (
      <div className="panel">
        <h2>History</h2>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="panel">
        <span className="spinner" /> Loading your library…
      </div>
    );
  }

  return (
    <div className="history">
      <header className="history__header">
        <span className="history__leaf" aria-hidden="true">🌿</span>
        <h2 className="history__title">Library</h2>
        <p className="lead">
          Every vocabulary you've uploaded. Click a row to inspect the words; press
          <em> Open</em> to make it your active deck.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="muted">No uploads yet. Upload a <code>vocabulary.pdf</code> from your profile.</p>
      ) : (
        <ul className="history__list">
          {items.map((it) => {
            const isOpen = openId === it.id;
            const words = wordsById[it.id];
            return (
              <li key={it.id} className={`history__row ${isOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="history__row-head"
                  onClick={() => toggle(it.id)}
                  aria-expanded={isOpen}
                >
                  <span className="history__row-icon" aria-hidden="true">📜</span>
                  <span className="history__row-name">Library</span>
                  <span className="history__row-meta">
                    {it.total} {it.total === 1 ? "word" : "words"}
                  </span>
                  <span className="history__row-date">{formatDate(it.created_at)}</span>
                  <span className="history__row-caret" aria-hidden="true">▾</span>
                </button>
                {isOpen && (
                  <div className="history__body">
                    <div className="history__actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => restore(it.id)}
                        disabled={restoringId === it.id}
                      >
                        {restoringId === it.id ? <span className="spinner" /> : "Open in Learn"}
                      </button>
                      <span className="muted" style={{ alignSelf: "center" }}>
                        {it.target_language} from {it.native_language}
                      </span>
                    </div>
                    {loadingId === it.id && (
                      <p className="muted"><span className="spinner" /> Loading words…</p>
                    )}
                    {words && (
                      <ol className="history__words">
                        {words.map((w, i) => (
                          <li key={i}>
                            <span className="history__words-num">{i + 1}.</span>
                            <span className="history__words-word">{w.word}</span>
                            <span className="history__words-translation muted">{w.translation}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
