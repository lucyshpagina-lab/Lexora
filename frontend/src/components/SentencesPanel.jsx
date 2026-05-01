import React from "react";

export default function SentencesPanel({ topic, word, sentences }) {
  const list = sentences || [];
  const topicLabel = topic?.topic ? topic.topic : "— no topic selected yet —";

  return (
    <div className="sentences-panel">
      <span className="sentences-panel__leaf" aria-hidden="true">🍃</span>
      <p className="eyebrow">Topic</p>
      <h3 className="sentences-panel__topic">{topicLabel}</h3>

      {word && (
        <p className="muted sentences-panel__word">
          Word: <strong>{word}</strong>
        </p>
      )}

      {list.length === 0 ? (
        <p className="sentences-panel__empty muted">
          Press <strong>Force</strong> on the card to generate example sentences.
        </p>
      ) : (
        <ol className="sentences-panel__list">
          {list.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
