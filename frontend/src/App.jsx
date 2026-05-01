import React, { useState } from "react";
import Header from "./components/Header.jsx";
import Upload from "./components/Upload.jsx";
import Review from "./components/Review.jsx";
import Grammar from "./components/Grammar.jsx";
import Stats from "./components/Stats.jsx";
import ExitModal from "./modals/ExitModal.jsx";
import { useSession } from "./hooks/useSession.js";
import { useHealth } from "./hooks/useApi.js";

export default function App() {
  const { session, setSession, clearSession } = useSession();
  const [view, setView] = useState(session ? "learn" : "upload");
  const [pendingExit, setPendingExit] = useState(false);
  const health = useHealth();

  const onSession = (result) => {
    setSession(result);
    setView("learn");
  };

  const requestView = (next) => {
    if (next === "upload" && session) {
      setPendingExit(true);
      return;
    }
    setView(next);
  };

  const confirmExit = () => {
    clearSession();
    setView("upload");
    setPendingExit(false);
  };

  return (
    <div className="app">
      <Header
        view={view}
        requestView={requestView}
        hasSession={!!session}
        llmLive={health?.llm_live}
      />
      <main className="main">
        <div className="container">
          {view === "upload" && <Upload onSession={onSession} />}
          {view === "learn" && session && <Review session={session} />}
          {view === "grammar" && session && <Grammar session={session} />}
          {view === "progress" && session && <Stats session={session} />}
        </div>
      </main>
      {pendingExit && (
        <ExitModal
          onConfirm={confirmExit}
          onCancel={() => setPendingExit(false)}
        />
      )}
    </div>
  );
}
