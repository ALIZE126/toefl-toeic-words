import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "./types";
import { loadState, saveState } from "./lib/storage";

export type Update = (fn: (s: AppState) => AppState) => void;

/** 全局状态：每次变化都写入 localStorage，关闭或刷新页面后恢复 */
export function useStore() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [saveError, setSaveError] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveError(saveState(state));
  }, [state]);
  const update: Update = useCallback((fn) => setState((s) => fn(s)), []);
  return { state, update, saveError };
}
