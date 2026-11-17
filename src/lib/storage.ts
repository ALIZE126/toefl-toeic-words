import type { AppState } from "../types";

export const STORAGE_KEY = "toefl-toeic-words/v1";

export function emptyState(): AppState {
  return {
    version: 1,
    entries: {},
    order: [],
    tracks: {},
    logs: [],
    settings: { newPerDay: 10, commuteMode: false, rate: 0.95 },
    imports: [],
    passageAttempts: [],
  };
}

export function loadState(storage: Storage = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed?.version !== 1 || typeof parsed.entries !== "object") return emptyState();
    const base = emptyState();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState, storage: Storage = localStorage): string | null {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch (e) {
    return e instanceof Error && e.name === "QuotaExceededError" ? "浏览器存储空间已满，进度未能保存。请导出备份。" : "进度保存失败";
  }
}

/** 导出 / 恢复备份（JSON） */
export function exportBackup(state: AppState): string {
  return JSON.stringify(state, null, 1);
}

export function parseBackup(text: string): AppState {
  const parsed = JSON.parse(text) as AppState;
  if (parsed?.version !== 1 || typeof parsed.entries !== "object" || !Array.isArray(parsed.order)) {
    throw new Error("不是本应用导出的备份文件");
  }
  const base = emptyState();
  return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
}
