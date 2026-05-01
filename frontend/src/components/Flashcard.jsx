import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import ProgressBar from "./ProgressBar.jsx";

const STATIC_SITE_BASE = "http://127.0.0.1:8080";

const TARGET_LANG_BCP47 = {
  English: "en-US",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Italian: "it-IT",
  Portuguese: "pt-PT",
  Russian: "ru-RU",
  Polish: "pl-PL",
  Dutch: "nl-NL",
  Swedish: "sv-SE",
  Greek: "el-GR",
  Latin: "la",
  Mandarin: "zh-CN",
  Japanese: "ja-JP",
  Korean: "ko-KR",
  Arabic: "ar-SA",
  Hebrew: "he-IL",
  Turkish: "tr-TR",
};

function speak(text, langTag) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  if (langTag) utter.lang = langTag;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export default function Flashcard({
  session,
  reloadKey = 0,
  activeTopic = null,
  onCardChange,
  onSentencesForce,
  onAlert,
}) {
  const [card, setCard] = useState(null);
  const [done, setDone] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [countModal, setCountModal] = useState(null); // null | { value: "" }

  const langTag = useMemo(
    () => TARGET_LANG_BCP47[session.target_language] || undefined,
    [session.target_language]
  );

  const setActiveCard = (c) => {
    setCard(c);
    onCardChange?.(c);
  };

  const loadCard = async () => {
    setError(null);
    setFlipped(false);
    try {
      const c = await api.nextWord(session.user_id);
      if (c.done) {
        setDone(true);
        setActiveCard(null);
      } else {
        setDone(false);
        setActiveCard(c);
      }
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  useEffect(() => {
    loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user_id, reloadKey]);

  const goPrevious = async () => {
    if (busy) return;
    setBusy(true);
    setFlipped(false);
    try {
      const c = await api.previousWord(session.user_id);
      if (c.done) {
        setDone(true);
        setActiveCard(null);
      } else {
        setDone(false);
        setActiveCard(c);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const fetchSentences = async (count) => {
    if (!card) return;
    setError(null);
    try {
      const out = await api.wordSentences(session.user_id, count);
      onSentencesForce?.(out.word, out.sentences);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  // Quick "Force" (ghost styling, default count = 3, no modal, no topic gate).
  const handleForce = async () => {
    if (forcing || !card) return;
    setForcing(true);
    try {
      await fetchSentences(3);
    } finally {
      setForcing(false);
    }
  };

  // "Generate sentences" — modal-driven flow with topic gate and count input.
  const handleGenerate = () => {
    if (!activeTopic) {
      onAlert?.({
        title: "Pick a grammar topic",
        message:
          "Click a grammar topic in the sidebar first, then enter how many sentences you want.",
        kind: "info",
      });
      return;
    }
    setCountModal({ value: "3" });
  };

  const submitCount = async () => {
    const raw = (countModal?.value || "").trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < 1 || n > 100) {
      // Validation message stays inside the modal — no submit, no close.
      setCountModal((m) => ({ ...m, error: "Enter an integer from 1 to 100." }));
      return;
    }
    setCountModal(null);
    setGenerating(true);
    try {
      await fetchSentences(n);
    } finally {
      setGenerating(false);
    }
  };

  if (done) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32 }}>The deck is complete.</h2>
        <p className="lead">Every word has been faced. Visit Progress for your tally.</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="panel">
        <span className="spinner" /> Loading…
      </div>
    );
  }

  const isFirstCard = card.index === 0;

  return (
    <div className="flashcard-area">
      <ProgressBar current={card.index} total={card.total} />

      {error && <div className="error-banner">{error}</div>}

      <div
        className={`flipcard ${flipped ? "is-flipped" : ""}`}
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <div className="flipcard__inner">
          <div className="flipcard__face flipcard__face--front">
            <span className="flipcard__leaf flipcard__leaf--tl" aria-hidden="true">🌿</span>
            <span className="flipcard__leaf flipcard__leaf--tr" aria-hidden="true">🍃</span>
            <span className="flipcard__leaf flipcard__leaf--bl" aria-hidden="true">🍃</span>
            <span className="flipcard__leaf flipcard__leaf--br" aria-hidden="true">🌿</span>
            <div className="muted">{session.target_language}</div>
            <div className="flipcard__row">
              <div className="word">{card.word}</div>
            </div>
          </div>
          <div className="flipcard__face flipcard__face--back">
            <span className="flipcard__leaf flipcard__leaf--tl" aria-hidden="true">🍃</span>
            <span className="flipcard__leaf flipcard__leaf--tr" aria-hidden="true">🌿</span>
            <span className="flipcard__leaf flipcard__leaf--bl" aria-hidden="true">🌿</span>
            <span className="flipcard__leaf flipcard__leaf--br" aria-hidden="true">🍃</span>
            <div className="muted">{session.native_language}</div>
            <div className="flipcard__row">
              <div className="word">{card.translation}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flashcard-actions">
        {isFirstCard ? (
          <a
            className="btn btn-primary btn-back-to-upload"
            href={`${STATIC_SITE_BASE}/profile.html#vocab-section`}
          >
            ← bring me to file uploading
          </a>
        ) : (
          <>
            <button className="btn btn-ghost" type="button" onClick={goPrevious} disabled={busy}>
              ← back
            </button>
            <button
              className="btn btn-ghost btn-voice"
              type="button"
              onClick={() => speak(card.word, langTag)}
              title="Pronounce"
              aria-label="Pronounce"
            >
              ♪ voice
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              title="Generate example sentences (asks for count)"
            >
              {generating ? <span className="spinner" /> : "Generate sentences"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleForce}
              disabled={forcing}
              title="Quickly generate 3 example sentences"
            >
              {forcing ? <span className="spinner" /> : "Force"}
            </button>
          </>
        )}
      </div>

      {countModal && (
        <CountModal
          value={countModal.value}
          error={countModal.error}
          topic={activeTopic?.topic}
          onChange={(v) =>
            setCountModal((m) => ({ value: v.replace(/\D/g, "").slice(0, 3), error: null }))
          }
          onCancel={() => setCountModal(null)}
          onSubmit={submitCount}
        />
      )}
    </div>
  );
}

function CountModal({ value, error, topic, onChange, onCancel, onSubmit }) {
  return (
    <div className="lex-modal__overlay is-open" onClick={onCancel}>
      <div className="lex-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="lex-modal__leaves" aria-hidden="true">
          <span className="lex-modal__leaf lex-modal__leaf--tl">🌿</span>
          <span className="lex-modal__leaf lex-modal__leaf--tr">🍃</span>
          <span className="lex-modal__leaf lex-modal__leaf--bl">🍃</span>
          <span className="lex-modal__leaf lex-modal__leaf--br">🌿</span>
        </div>
        <h3 className="lex-modal__title">Generate sentences</h3>
        <div className="lex-modal__body">
          <p>
            Topic: <strong>{topic}</strong>
          </p>
          <label className="lex-modal__field">
            <span>How many sentences? (1 — 100)</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
                if (e.key === "Escape") { e.preventDefault(); onCancel(); }
              }}
              autoFocus
            />
          </label>
        </div>
        {error && <div className="lex-modal__error" role="alert">{error}</div>}
        <div className="lex-modal__actions">
          <button type="button" className="lex-modal__btn lex-modal__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="lex-modal__btn lex-modal__btn--primary" onClick={onSubmit}>
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
