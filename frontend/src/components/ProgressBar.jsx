import React from "react";

export default function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div>
      <div className="progress">
        <span>Progress</span>
        <span>
          {current} / {total}
        </span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
