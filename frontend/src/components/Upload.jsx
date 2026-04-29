import React, { useState } from "react";
import { api } from "../api.js";
import UploadConfirmModal from "../modals/UploadConfirmModal.jsx";

const LANGUAGES = ["English", "French"];

const METHODS = [
  { id: "local", label: "Upload from device", hint: "PDF or .txt with one entry per line" },
  { id: "drive", label: "Read from Google Drive", hint: "Requires the Drive MCP server" },
];

export default function Upload({ onSession }) {
  const [method, setMethod] = useState(null);
  const [native, setNative] = useState("English");
  const [target, setTarget] = useState("Spanish");
  const [file, setFile] = useState(null);
  const [driveFileId, setDriveFileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let result;
      if (pendingAction === "local") {
        result = await api.upload(file, native, target);
      } else if (pendingAction === "drive") {
        result = await api.uploadDrive(driveFileId, native, target);
      } else if (pendingAction === "demo") {
        result = await api.demo(native, target);
      }
      onSession(result);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const requestLocal = (e) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF or .txt file first.");
      return;
    }
    setError(null);
    setPendingAction("local");
  };

  const requestDrive = (e) => {
    e.preventDefault();
    if (!driveFileId.trim()) {
      setError("Paste a Google Drive file ID.");
      return;
    }
    setError(null);
    setPendingAction("drive");
  };

  const requestDemo = () => {
    setError(null);
    setPendingAction("demo");
  };

  if (!method) {
    return (
      <div className="panel">
        <h2>Choose your upload method</h2>
        <p className="lead">
          The File Agent will validate, parse, and extract vocabulary
          deterministically — no LLM in the file pipeline.
        </p>
        <div className="topic-list">
          {METHODS.map((m) => (
            <button key={m.id} className="topic-item" onClick={() => setMethod(m.id)}>
              <h3>{m.label}</h3>
              <p>{m.hint}</p>
            </button>
          ))}
          <button className="topic-item" onClick={requestDemo} disabled={busy}>
            <h3>Try the demo deck</h3>
            <p>Skip the file flow with a built-in Spanish→English vocabulary.</p>
          </button>
        </div>
        {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
        {pendingAction === "demo" && (
          <UploadConfirmModal
            onConfirm={submit}
            onCancel={() => setPendingAction(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <button className="btn btn-ghost" onClick={() => setMethod(null)}>
        ← Method
      </button>
      <h2 style={{ marginTop: 16 }}>
        {method === "local" ? "Upload from device" : "Read from Google Drive"}
      </h2>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={method === "local" ? requestLocal : requestDrive}>
        <div className="form-row">
          <div>
            <label>I speak</label>
            <select value={native} onChange={(e) => setNative(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>I'm learning</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {method === "local" ? (
          <>
            <label>Vocabulary file</label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </>
        ) : (
          <>
            <label>Google Drive file ID</label>
            <input
              type="text"
              value={driveFileId}
              onChange={(e) => setDriveFileId(e.target.value)}
              placeholder="e.g. 1A2b3C4d5E6f7G8h9I0jK"
            />
            <p className="muted" style={{ marginTop: 8 }}>
              The backend calls <code>read_pdf_from_drive(file_id)</code>, which
              shells out to the configured Drive MCP server (env <code>LEXORA_DRIVE_MCP</code>).
              If unset, you'll get a clear error.
            </p>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : "Continue"}
          </button>
        </div>
      </form>

      {(pendingAction === "local" || pendingAction === "drive") && (
        <UploadConfirmModal
          onConfirm={submit}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
