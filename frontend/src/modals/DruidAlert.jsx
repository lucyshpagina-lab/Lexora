import React, { useEffect } from "react";

export default function DruidAlert({ title = "Notice", message, kind = "info", onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lex-modal__overlay is-open" onClick={onClose}>
      <div className="lex-modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lex-modal__leaves" aria-hidden="true">
          <span className="lex-modal__leaf lex-modal__leaf--tl">🌿</span>
          <span className="lex-modal__leaf lex-modal__leaf--tr">🍃</span>
          <span className="lex-modal__leaf lex-modal__leaf--bl">🍃</span>
          <span className="lex-modal__leaf lex-modal__leaf--br">🌿</span>
        </div>
        <h3 className="lex-modal__title">{title}</h3>
        <div className="lex-modal__body">
          <p>{message}</p>
        </div>
        <div className="lex-modal__actions">
          <button
            type="button"
            className={`lex-modal__btn lex-modal__btn--${kind === "danger" ? "danger" : "primary"}`}
            onClick={onClose}
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
