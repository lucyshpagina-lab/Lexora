const BASE = "/api";
const TOKEN_KEY = "lexora.token";

function authHeaders() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function jsonOrThrow(res) {
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof data === "string" ? data : data.detail || res.statusText;
    throw new Error(message);
  }
  return data;
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(jsonOrThrow),

  upload: (file, native, target) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("native_language", native);
    fd.append("target_language", target);
    return fetch(`${BASE}/upload`, { method: "POST", body: fd }).then(jsonOrThrow);
  },

  uploadDrive: (fileId, native, target) =>
    fetch(`${BASE}/upload/drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: fileId,
        native_language: native,
        target_language: target,
      }),
    }).then(jsonOrThrow),

  demo: (native = "English", target = "Spanish") =>
    fetch(`${BASE}/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ native_language: native, target_language: target }),
    }).then(jsonOrThrow),

  nextWord: (userId) =>
    fetch(`${BASE}/word/next?user_id=${encodeURIComponent(userId)}`).then(jsonOrThrow),

  previousWord: (userId) =>
    fetch(`${BASE}/word/previous?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
    }).then(jsonOrThrow),

  advanceWord: (userId) =>
    fetch(`${BASE}/word/advance?user_id=${encodeURIComponent(userId)}`, {
      method: "POST",
    }).then(jsonOrThrow),

  seekWord: (userId, index) =>
    fetch(
      `${BASE}/word/seek?user_id=${encodeURIComponent(userId)}&index=${index}`,
      { method: "POST" }
    ).then(jsonOrThrow),

  wordSentences: (userId, count = 3) =>
    fetch(
      `${BASE}/word/sentences?user_id=${encodeURIComponent(userId)}&count=${count}`,
      { method: "POST" }
    ).then(jsonOrThrow),

  review: (userId, answer, advance = true) =>
    fetch(`${BASE}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, answer, advance }),
    }).then(jsonOrThrow),

  grammarTopics: (userId, level = "advanced") =>
    fetch(
      `${BASE}/grammar/topics?user_id=${encodeURIComponent(userId)}&level=${encodeURIComponent(level)}`
    ).then(jsonOrThrow),

  grammarContent: (userId, topic) =>
    fetch(`${BASE}/grammar/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, topic }),
    }).then(jsonOrThrow),

  progress: (userId) =>
    fetch(`${BASE}/progress/${encodeURIComponent(userId)}`).then(jsonOrThrow),

  vocabulary: (userId) =>
    fetch(`${BASE}/vocabulary?user_id=${encodeURIComponent(userId)}`).then(jsonOrThrow),

  me: () =>
    fetch(`${BASE}/auth/me`, { headers: authHeaders() }).then(jsonOrThrow),

  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/auth/avatar`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    }).then(jsonOrThrow);
  },

  // -- History --

  history: () =>
    fetch(`${BASE}/history`, { headers: authHeaders() }).then(jsonOrThrow),

  historyEntry: (uploadId) =>
    fetch(`${BASE}/history/${uploadId}`, { headers: authHeaders() }).then(jsonOrThrow),

  historyRestore: (uploadId) =>
    fetch(`${BASE}/history/${uploadId}/restore`, {
      method: "POST",
      headers: authHeaders(),
    }).then(jsonOrThrow),
};
