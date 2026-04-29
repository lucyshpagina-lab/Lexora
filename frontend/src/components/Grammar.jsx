import React, { useState } from "react";
import { api } from "../api.js";
import {
  SPEAKOUT_TOPICS,
  SPEAKOUT_LEVELS,
  SPEAKOUT_LEVEL_LABELS,
} from "../data/speakoutTopics.js";

export default function Grammar({ session }) {
  const [openLevels, setOpenLevels] = useState(() => new Set(["A1"]));
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState(null);

  const toggleLevel = (lvl) => {
    setOpenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
      return next;
    });
  };

  const openTopic = async (topic, level) => {
    const sel = { ...topic, level };
    setSelected(sel);
    setContent(null);
    setLoadingContent(true);
    setError(null);
    try {
      const c = await api.grammarContent(session.user_id, topic.topic);
      setContent(c);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <div className="study-layout">
      <aside className="grammar-sidebar">
        <h2 className="grammar-sidebar__title">Grammar</h2>
        {SPEAKOUT_LEVELS.map((lvl) => {
          const isOpen = openLevels.has(lvl);
          const items = SPEAKOUT_TOPICS[lvl] || [];
          return (
            <div key={lvl} className={`grammar-level ${isOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="grammar-level__head"
                onClick={() => toggleLevel(lvl)}
                aria-expanded={isOpen}
              >
                <span>{SPEAKOUT_LEVEL_LABELS[lvl]}</span>
                <span className="grammar-level__count">{items.length}</span>
                <span className="grammar-level__caret" aria-hidden="true">▶</span>
              </button>
              <ul className="grammar-level__items">
                {items.map((t) => (
                  <li key={t.topic}>
                    <button
                      type="button"
                      className={`grammar-level__item ${selected?.topic === t.topic ? "is-active" : ""}`}
                      onClick={() => openTopic(t, lvl)}
                    >
                      {t.topic}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>

      <section className="panel">
        {!selected && (
          <>
            <p className="eyebrow">Speakout · A1 — C2</p>
            <h2>Choose a grammar topic</h2>
            <p className="lead">
              Pick a level on the left and tap a topic. The Grammar Agent will
              produce ten exercises that weave in the vocabulary you uploaded.
            </p>
          </>
        )}

        {selected && (
          <>
            <p className="eyebrow">{selected.level} · {session.target_language}</p>
            <h2>{selected.topic}</h2>
            <p className="lead">{selected.description}</p>

            {error && <div className="error-banner">{error}</div>}

            {loadingContent && (
              <p>
                <span className="spinner" /> Generating exercises with your vocabulary…
              </p>
            )}

            {content && (
              <>
                <h3 style={{ fontFamily: "var(--font-serif)", marginTop: 18 }}>Rule</h3>
                <p>{content.rule}</p>

                <h3 style={{ fontFamily: "var(--font-serif)", marginTop: 18 }}>Scheme</h3>
                <div className="scheme">{content.scheme}</div>

                <h3 style={{ fontFamily: "var(--font-serif)", marginTop: 18 }}>Exercises</h3>
                <ol className="exercise-list">
                  {content.sentences.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
