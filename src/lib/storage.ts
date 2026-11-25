import type { AppState } from "../types";
import { migrateDecks } from "./decks";

export const STORAGE_KEY = "toefl-toeic-words/v1";
/** 迁移或恢复前的数据副本（只保留最近一份，可在出问题时手动还原） */
export const SNAPSHOT_KEY = "toefl-toeic-words/v1/snapshot";

/** 当前存储结构版本 */
export const SCHEMA = 2;

/**
 * 增量迁移，每一步只补字段、不删数据，可以重复执行：
 * 1 → 2：词条补 decks（旧数据归入托福），会话补 scope / deck，补 readingDrafts。
 */
export function migrate(state: AppState): AppState {
  let s = state;
  // 1 → 2（幂等：已迁移过的数据原样返回，所以每次读取都执行，也能修好残缺的数据）
  s = migrateDecks(s);
  if (s.session && (!s.session.scope || !s.session.deck)) s = { ...s, session: { scope: "daily", deck: "all", ...s.session } };
  if (!s.readingDrafts) s = { ...s, readingDrafts: {} };
  return s.schema === SCHEMA ? s : { ...s, schema: SCHEMA };
}

/** 保留一份数据副本（迁移前、恢复备份前） */
export function keepSnapshot(state: AppState, reason: string, storage: Storage = localStorage) {
  try {
    storage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: new Date().toISOString(), reason, state }));
  } catch {
    /* 空间不够时放弃副本，不影响正常保存 */
  }
}

export function emptyState(): AppState {
  return {
    version: 1,
    entries: {},
    order: [],
    tracks: {},
    logs: [],
    settings: { newPerDay: 10, commuteMode: false, rate: 0.95, deck: "all" },
    imports: [],
    passageAttempts: [],
    schema: SCHEMA,
    readingDrafts: {},
  };
}

/** 把存下来的 JSON 解析成状态（旧版本自动迁移，迁移前留副本） */
export function parseStored(raw: string | null, storage: Storage = localStorage): AppState {
  try {
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed?.version !== 1 || typeof parsed.entries !== "object") return emptyState();
    const base = emptyState();
    if ((parsed.schema ?? 1) < SCHEMA) keepSnapshot(parsed, `migrate ${parsed.schema ?? 1}→${SCHEMA}`, storage);
    return migrate({ ...base, schema: parsed.schema, ...parsed, settings: { ...base.settings, ...parsed.settings } });
  } catch {
    return emptyState();
  }
}

/** 同步读取 localStorage（测试和没有 IndexedDB 时用；正式启动见 stateDb.loadStateAsync） */
export function loadState(storage: Storage = localStorage): AppState {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  return parseStored(raw, storage);
}

export function saveState(state: AppState, storage: Storage = localStorage, json = JSON.stringify(state)): string | null {
  try {
    storage.setItem(STORAGE_KEY, json);
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
  return migrate({ ...base, schema: parsed.schema, ...parsed, settings: { ...base.settings, ...parsed.settings } });
}
