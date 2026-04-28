import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import ProgressBar from "./ProgressBar.jsx";

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

function classifyDiffToken(tok) {
  if (tok.startsWith("+ ")) return "add";
  if (tok.startsWith("- ")) return "remove";
  return "same";
}

function stripDiffMark(tok) {
  if (tok.startsWith("+ ") || tok.startsWith("- ") || tok.startsWith("  ")) {
    return tok.slice(2);
  }
  return tok;
}

export default function Flashcard({ session }) {
  const [card, setCard] = useState(null);
  const [done, setDone] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const langTag = useMemo(
    () => TARGET_LANG_BCP47[session.target_language] || undefined,
    [session.target_language]
  );

  const loadCard = async () => {
    setError(null);
    try {
      const c = await api.nextWord(session.user_id);
      if (c.done) {
        setDone(true);
        setCard(null);
      } else {
        setDone(false);
        setCard(c);
      }
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  useEffect(() => {
    loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user_id]);

  const submitAnswer = async (e) => {
    e?.preventDefault();
    if (!card || busy) return;
    setBusy(true);
    try {
      const result = await api.review(session.user_id, answer, true);
      setFeedback(result);
      if (result.correct && result.next_card) {
        // Wait briefly so the user sees the success state.
        setTimeout(() => {
          setFeedback(null);
          setAnswer("");
          if (result.next_card === null) {
            setDone(true);
            setCard(null);
          } else {
            setCard(result.next_card);
          }
          inputRef.current?.focus();
        }, 700);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const showAnswer = () => {
    if (!card) return;
    setFeedback({
      correct: false,
      close: false,
      ratio: 0,
      expected: card.translation,
      user_input: answer,
      diff: [],
      revealed: true,
    });
  };

  const goPrevious = async () => {
    setBusy(true);
    setFeedback(null);
    setAnswer("");
    try {
      const c = await api.previousWord(session.user_id);
      if (c.done) {
        setDone(true);
        setCard(null);
      } else {
        setDone(false);
        setCard(c);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-gothic)", fontSize: 32 }}>The deck is complete.</h2>
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

  return (
    <div>
      <ProgressBar current={card.index} total={card.total} />

      {error && <div className="error-banner">{error}</div>}

      <div className="flashcard">
        <div className="muted">{session.target_language}</div>
        <div className="word">{card.word}</div>
        <button
          className="audio-btn"
          onClick={() => speak(card.word, langTag)}
          title="Pronounce"
          aria-label="Pronounce"
        >
          ♪
        </button>

        <form onSubmit={submitAnswer} className="translation-input">
          <label>Translate to {session.native_language}</label>
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your translation"
            autoFocus
          />

          <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
            <button className="btn btn-ghost" type="button" onClick={goPrevious} disabled={busy}>
              ← Previous
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || !answer.trim()}>
              {busy ? <span className="spinner" /> : "Check"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={showAnswer} disabled={busy}>
              Show answer
            </button>
          </div>
        </form>

        {feedback && (
          <div
            className={`feedback ${
              feedback.correct ? "correct" : feedback.close ? "close" : "incorrect"
            }`}
          >
            {feedback.revealed
              ? <>The translation is <strong>{feedback.expected}</strong>.</>
              : feedback.correct
              ? "Correct."
              : feedback.close
              ? <>Close. Expected <strong>{feedback.expected}</strong>.</>
              : <>Not quite. Expected <strong>{feedback.expected}</strong>.</>}
            {feedback.diff && feedback.diff.length > 0 && (
              <div className="diff">
                {feedback.diff.map((tok, i) => (
                  <span key={i} className={`diff-token ${classifyDiffToken(tok)}`}>
                    {stripDiffMark(tok)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
