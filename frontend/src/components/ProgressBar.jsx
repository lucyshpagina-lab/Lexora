import React from "react";

/**
 * Wood-log progress bar with the druid figure standing directly on the
 * lying log, holding a flickering torch.
 */
export default function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress">
        <span>
          {current} / {total}
        </span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
        <span className="progress-druid" aria-hidden="true">
          <DruidWithLantern />
        </span>
      </div>
    </div>
  );
}

function DruidWithLantern() {
  return (
    <svg viewBox="0 0 64 80" width="56" height="70" xmlns="http://www.w3.org/2000/svg">
      {/* === Torch light: outer halos (animated pulse) === */}
      <circle cx="48" cy="10" r="15" fill="#fff7c2" opacity="0.16" className="progress-druid__halo" />
      <circle cx="48" cy="10" r="10" fill="#ffd980" opacity="0.30" className="progress-druid__halo" />
      <circle cx="48" cy="10" r="6"  fill="#fff7c2" opacity="0.55" className="progress-druid__halo" />

      {/* light rays radiating from the flame */}
      <g className="progress-druid__rays" stroke="#fff7c2" strokeWidth="0.9" strokeLinecap="round" opacity="0.65">
        <line x1="48" y1="10" x2="48" y2="-2" />
        <line x1="48" y1="10" x2="62" y2="10" />
        <line x1="48" y1="10" x2="58" y2="-1" />
        <line x1="48" y1="10" x2="58" y2="22" />
        <line x1="48" y1="10" x2="38" y2="-1" />
        <line x1="48" y1="10" x2="60" y2="20" />
      </g>

      {/* === Druid figure === */}
      {/* cloak */}
      <path
        d="M30 38 Q 18 50 18 74 L 42 74 Q 42 50 32 38 Z"
        fill="#1f3a2c" stroke="#0e1f15" strokeWidth="0.7"
      />
      {/* hood */}
      <path
        d="M30 22 Q 18 26 22 40 Q 30 36 38 40 Q 42 26 30 22 Z"
        fill="#1f3a2c" stroke="#0e1f15" strokeWidth="0.7"
      />
      {/* glowing eyes */}
      <circle cx="26" cy="32" r="1" fill="#c8e26a" />
      <circle cx="34" cy="32" r="1" fill="#c8e26a" />
      {/* arm reaching up to the torch */}
      <line x1="40" y1="42" x2="46" y2="20" stroke="#1f3a2c" strokeWidth="2.6" strokeLinecap="round" />
      {/* torch handle */}
      <line x1="46" y1="20" x2="48" y2="14" stroke="#6f4d33" strokeWidth="2.4" strokeLinecap="round" />

      {/* torch flame (animated flicker) */}
      <g className="progress-druid__flame">
        <path d="M48 14 Q 43 9 46 3 Q 47 6 48 3 Q 49 6 50 2 Q 53 8 48 14 Z" fill="#ff8a3c" />
        <path d="M48 13 Q 45 9 47 5 Q 48 7 48 4 Q 50 7 50 10 Q 49 12 48 13 Z" fill="#ffd980" />
        <path d="M48 12 Q 47 10 48 7 Q 49 10 48 12 Z" fill="#fff7c2" />
      </g>

      {/* boots planted on the log */}
      <ellipse cx="24" cy="76" rx="3" ry="1.4" fill="#0e1f15" />
      <ellipse cx="36" cy="76" rx="3" ry="1.4" fill="#0e1f15" />
    </svg>
  );
}
