import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import ProgressBar from "./ProgressBar.jsx";

export default function Stats({ session }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .progress(session.user_id)
      .then((p) => {
        if (!cancelled) setProgress(p);
      })
      .catch((e) => !cancelled && setError(e.message || String(e)));
    return () => {
      cancelled = true;
    };
  }, [session.user_id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!progress) return <p><span className="spinner" /> Loading…</p>;

  const { stats } = progress;
  return (
    <div className="panel">
      <h2>Progress</h2>
      <p className="lead">
        Learning {progress.target_language} from {progress.native_language}.
      </p>

      <ProgressBar current={progress.current} total={progress.total} />

      <div className="stats-grid">
        <div className="stat">
          <div className="num">{stats.correct}</div>
          <div className="lbl">Correct</div>
        </div>
        <div className="stat">
          <div className="num">{stats.close}</div>
          <div className="lbl">Close</div>
        </div>
        <div className="stat">
          <div className="num">{stats.incorrect}</div>
          <div className="lbl">Missed</div>
        </div>
      </div>
    </div>
  );
}
