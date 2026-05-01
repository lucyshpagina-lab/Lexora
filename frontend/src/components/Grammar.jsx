import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import GrammarSidebar from "./GrammarSidebar.jsx";

export default function Grammar({ session, initialTopic = null, onTopicHandled }) {
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState(null);

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

  // When the parent (App) hands us a topic to auto-open (e.g. user clicked
  // it from the Learn-view sidebar), open it once and notify back.
  useEffect(() => {
    if (!initialTopic) return;
    openTopic(initialTopic.topic, initialTopic.level);
    onTopicHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic]);

  return (
    <div className="study-layout">
      <GrammarSidebar
        selectedTopic={selected}
        onTopicClick={(topic, level) => openTopic(topic, level)}
        title="Grammar"
      />

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
