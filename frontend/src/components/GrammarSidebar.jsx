import React, { useState } from "react";
import {
  SPEAKOUT_TOPICS,
  SPEAKOUT_LEVELS,
  SPEAKOUT_LEVEL_LABELS,
} from "../data/speakoutTopics.js";

export default function GrammarSidebar({
  selectedTopic = null,
  onTopicClick,
  title = "overall grammar",
  initialOpenLevels = ["A1"],
}) {
  const [openLevels, setOpenLevels] = useState(() => new Set(initialOpenLevels));

  const toggleLevel = (lvl) => {
    setOpenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl); else next.add(lvl);
      return next;
    });
  };

  return (
    <aside className="grammar-sidebar">
      <span className="grammar-sidebar__leaf" aria-hidden="true">🌿</span>
      <h2 className="grammar-sidebar__title">{title}</h2>
      <div className="grammar-sidebar__scroll">
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
                <span className="grammar-level__label">{SPEAKOUT_LEVEL_LABELS[lvl]}</span>
                <span className="grammar-level__count">{items.length}</span>
                <span className="grammar-level__caret" aria-hidden="true">▶</span>
              </button>
              <ul className="grammar-level__items">
                {items.map((t) => (
                  <li key={t.topic}>
                    <button
                      type="button"
                      className={`grammar-level__item ${selectedTopic?.topic === t.topic ? "is-active" : ""}`}
                      onClick={() => onTopicClick?.(t, lvl)}
                    >
                      {t.topic}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
