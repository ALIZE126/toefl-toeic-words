/**
 * 词库和进度的主存储：IndexedDB（没有 localStorage 约 5 MB 的上限，每天学几百个词也存得下）。
 * localStorage 仍同步写一份（存得下时），作为后备和旧版本兼容；启动时取两边较新的那份。
 */
import type { AppState } from "../types";
import { STORAGE_KEY, parseStored, saveState } from "./storage";

const DB_NAME = "toefl-toeic-words-state";
const STORE = "state";
const KEY = "current";

interface Record_ {
  key: string;
  savedAt: number;
  json: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function supported() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("no indexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function readRecord(): Promise<Record_ | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result as Record_ | undefined);
    r.onerror = () => reject(r.error);
  });
}

/** localStorage 里那份的保存时间（旧版本没有，视为 0） */
function localSavedAt(): number {
  try {
    return Number(localStorage.getItem(`${STORAGE_KEY}/savedAt`) ?? 0);
  } catch {
    return 0;
  }
}

/** 启动时读取：IndexedDB 和 localStorage 取较新的；都没有就是空词库 */
export async function loadStateAsync(): Promise<AppState> {
  let rec: Record_ | undefined;
  try {
    rec = await readRecord();
  } catch {
    rec = undefined;
  }
  const local = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  const useLocal = local && (!rec || localSavedAt() > rec.savedAt);
  return parseStored(useLocal ? local : (rec?.json ?? null));
}

let pending: { json: string; at: number } | null = null;
let writing = false;

async function flush(): Promise<string | null> {
  if (writing || !pending) return null;
  writing = true;
  try {
    while (pending) {
      const { json, at } = pending;
      pending = null;
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ key: KEY, savedAt: at, json } satisfies Record_);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    return null;
  } catch (e) {
    return e instanceof Error && e.name === "QuotaExceededError" ? "浏览器存储空间已满，进度未能保存。请导出备份。" : "进度保存失败";
  } finally {
    writing = false;
  }
}

/**
 * 保存：先写 IndexedDB（合并连续的写入，只写最新一份），再尽量写 localStorage。
 * 返回错误提示（两边都没存下时）或 null。
 */
export async function saveStateAsync(state: AppState): Promise<string | null> {
  const at = Date.now();
  const json = JSON.stringify(state);
  let localOk = false;
  if (saveState(state, localStorage, json) === null) {
    localOk = true;
    try {
      localStorage.setItem(`${STORAGE_KEY}/savedAt`, String(at));
    } catch {
      /* 忽略 */
    }
  } else {
    // localStorage 放不下了：删掉旧副本，免得启动时误用过期数据
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(`${STORAGE_KEY}/savedAt`);
    } catch {
      /* 忽略 */
    }
  }
  if (!supported()) return localOk ? null : "浏览器存储空间已满，进度未能保存。请导出备份。";
  pending = { json, at };
  const err = await flush();
  return err && !localOk ? err : null;
}

/** 测试用 */
export function resetStateDbForTests() {
  dbPromise = null;
  pending = null;
  writing = false;
}
