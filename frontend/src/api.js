const BASE = "/api";

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
};
