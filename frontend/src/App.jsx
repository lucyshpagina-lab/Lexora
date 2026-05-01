import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Review from "./components/Review.jsx";
import Grammar from "./components/Grammar.jsx";
import Stats from "./components/Stats.jsx";
import GrammarSidebar from "./components/GrammarSidebar.jsx";
import WordsList from "./components/WordsList.jsx";
import SentencesPanel from "./components/SentencesPanel.jsx";
import History from "./components/History.jsx";
import DruidAlert from "./modals/DruidAlert.jsx";
import { api } from "./api.js";
import { useSession } from "./hooks/useSession.js";
import { useProfile } from "./hooks/useProfile.js";

const STATIC_SITE_BASE = "http://127.0.0.1:8080";

function readInitialView() {
  if (typeof window === "undefined") return "learn";
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return "learn";
  const v = new URLSearchParams(hash).get("view");
  return v && ["learn", "grammar", "progress", "history"].includes(v) ? v : "learn";
}

export default function App() {
  const { session, setSession } = useSession();
  const { profile, setProfile, signOut } = useProfile();
  const [view, setView] = useState(readInitialView);
  const [alertState, setAlertState] = useState(null); // { title, message, kind }

  // When the user clicks a topic from the sidebar, hop to Grammar with the
  // topic preselected. Also remember the most-recent topic so the Sentences
  // panel can label its list.
  const [pendingGrammarTopic, setPendingGrammarTopic] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);

  // Lifted card state — Flashcard reports the visible card upward so the
  // WordsList can highlight it and the SentencesPanel can show that word's
  // generated sentences.
  const [activeCard, setActiveCard] = useState(null);
  const [sentencesByWord, setSentencesByWord] = useState({});

  // Bumped whenever an external action (seek-from-words-list) requires the
  // Flashcard to refetch. Plain counter — value doesn't matter.
  const [reloadKey, setReloadKey] = useState(0);

  // No session → bounce back to the static profile page.
  useEffect(() => {
    if (!session) {
      window.location.href = `${STATIC_SITE_BASE}/profile.html`;
    }
  }, [session]);

  const requestView = (next) => setView(next);

  const handleSidebarTopic = (topic, level) => {
    const sel = { ...topic, level };
    setActiveTopic(sel);
    setPendingGrammarTopic(sel);
    setView("grammar");
  };

  const handleSeekWord = async (idx) => {
    if (!session) return;
    try {
      await api.seekWord(session.user_id, idx);
      setReloadKey((k) => k + 1);
    } catch (e) {
      console.error("seek failed:", e);
    }
  };

  const handleCardChange = (card) => setActiveCard(card);

  const handleSentencesForce = (word, sentences) => {
    setSentencesByWord((prev) => ({ ...prev, [word]: sentences }));
  };

  if (!session) {
    return (
      <div className="app">
        <Header
          profile={profile}
          setProfile={setProfile}
          requestView={requestView}
          onSignOut={signOut}
          onAlert={setAlertState}
        />
        <div className="layout-redirect">
          <div className="panel">
            <span className="spinner" /> Redirecting to profile…
          </div>
        </div>
        {alertState && <DruidAlert {...alertState} onClose={() => setAlertState(null)} />}
      </div>
    );
  }

  return (
    <div className="app app--with-sidebar">
      <Header
        profile={profile}
        setProfile={setProfile}
        requestView={requestView}
        onSignOut={signOut}
        onAlert={setAlertState}
      />
      <GrammarSidebar
        selectedTopic={activeTopic}
        onTopicClick={handleSidebarTopic}
        title="overall grammar"
        initialOpenLevels={[]}
      />
      <main className="main">
        <div className="container">
          {view === "learn" && (
            <>
              <Review
                session={session}
                reloadKey={reloadKey}
                activeTopic={activeTopic}
                onCardChange={handleCardChange}
                onSentencesForce={handleSentencesForce}
                onAlert={setAlertState}
              />
              <div className="below-card">
                <WordsList
                  session={session}
                  currentIndex={activeCard?.index ?? 0}
                  refreshKey={reloadKey}
                  onSeek={handleSeekWord}
                />
                <SentencesPanel
                  topic={activeTopic}
                  word={activeCard?.word}
                  sentences={activeCard ? sentencesByWord[activeCard.word] : null}
                />
              </div>
            </>
          )}
          {view === "grammar" && (
            <Grammar
              session={session}
              initialTopic={pendingGrammarTopic}
              onTopicHandled={() => setPendingGrammarTopic(null)}
            />
          )}
          {view === "progress" && <Stats session={session} />}
          {view === "history" && (
            <History
              onRestore={(out) => {
                setSession({ user_id: out.user_id });
                setReloadKey((k) => k + 1);
                setView("learn");
              }}
            />
          )}
        </div>
      </main>
      {alertState && <DruidAlert {...alertState} onClose={() => setAlertState(null)} />}
    </div>
  );
}
