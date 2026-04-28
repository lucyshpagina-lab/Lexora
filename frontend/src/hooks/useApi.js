import { useEffect, useState } from "react";
import { api } from "../api.js";

export function useHealth() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false, llm_live: false }));
  }, []);
  return health;
}
