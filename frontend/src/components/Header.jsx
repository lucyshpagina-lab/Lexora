import React from "react";

const TABS = [
  { id: "upload", label: "Upload" },
  { id: "learn", label: "Learn" },
  { id: "grammar", label: "Grammar" },
  { id: "progress", label: "Progress" },
];

export default function Header({ view, requestView, hasSession, llmLive }) {
  return (
    <header className="header">
      <div className="brand">Lexora</div>
      <nav>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${view === tab.id ? "active" : ""}`}
            disabled={tab.id !== "upload" && !hasSession}
            onClick={() => requestView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {llmLive !== undefined && (
          <span className={`llm-badge ${llmLive ? "live" : "mock"}`}>
            {llmLive ? "LLM live" : "LLM mock"}
          </span>
        )}
      </nav>
    </header>
  );
}
