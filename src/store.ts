import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "./types";
import { loadState } from "./lib/storage";
import { saveStateAsync } from "./lib/stateDb";

export type Update = (fn: (s: AppState) => AppState) => void;

/**
 * 全局状态：每次变化都保存（IndexedDB 为主，localStorage 后备），关闭或刷新页面后恢复。
 * initial 由 main.tsx 在启动时从 IndexedDB 读好传入；没传（测试）时从 localStorage 读。
 */
export function useStore(initial?: AppState) {
  const [state, setState] = useState<AppState>(() => initial ?? loadState());
  const [saveError, setSaveError] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let alive = true;
    void saveStateAsync(state).then((err) => alive && setSaveError(err));
    return () => {
      alive = false;
    };
  }, [state]);
  const update: Update = useCallback((fn) => setState((s) => fn(s)), []);
  return { state, update, saveError };
}
