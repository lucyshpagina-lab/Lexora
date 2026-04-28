import React from "react";

export default function GothicModal({ title, body, confirmLabel = "Continue", cancelLabel = "Cancel", onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-body">{body}</p>
        <div className="modal-actions">
          {onCancel && (
            <button className="btn btn-ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
