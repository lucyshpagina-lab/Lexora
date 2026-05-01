import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function WordsList({ session, currentIndex, refreshKey, onSeek }) {
  const [vocab, setVocab] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .vocabulary(session.user_id)
      .then((v) => { if (!cancelled) setVocab(v.vocabulary); })
      .catch((e) => !cancelled && setError(e.message || String(e)));
    return () => { cancelled = true; };
  }, [session.user_id, refreshKey]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!vocab) return <div className="words-list muted">Loading words…</div>;

  return (
    <ul className="words-list">
      {vocab.map((entry) => (
        <li key={entry.index}>
          <button
            type="button"
            className={`words-list__item ${entry.index === currentIndex ? "is-active" : ""}`}
            onClick={() => onSeek?.(entry.index)}
          >
            <span className="words-list__num">{entry.index + 1}.</span>
            <span className="words-list__text">
              <span className="words-list__word">{entry.word}</span>
              <span className="words-list__translation muted">{entry.translation}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
