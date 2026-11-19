/**
 * AI 语音（音频包）的本地存储：单独的 IndexedDB 数据库，键是规范化后的文字（audioKey）。
 * 播放时按文字查找；没有音频的句子仍用浏览器语音合成。
 */

const DB_NAME = "toefl-toeic-words-audio";
const STORE = "audio";

export interface StoredAudio {
  key: string;
  text: string;
  type: string;
  data: ArrayBuffer;
  voice?: string;
  accent?: string;
}

/** 和 scripts/part1-audio.mjs 里的 norm() 一致 */
export function audioKey(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

let dbPromise: Promise<IDBDatabase> | null = null;
let known: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

function supported() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
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
        reject(req.error ?? new Error("打开语音存储失败"));
      };
    });
  }
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 读取本机已有的音频列表（启动时调用一次，之后同步判断 hasAudio） */
export function loadAudioIndex(): Promise<Set<string>> {
  if (known) return Promise.resolve(known);
  if (!supported()) return Promise.resolve((known = new Set()));
  loading ??= openDb()
    .then((db) => done(db.transaction(STORE).objectStore(STORE).getAllKeys()))
    .then((keys) => (known = new Set(keys.map(String))))
    .catch(() => (known = new Set()))
    .finally(() => {
      loading = null;
      listeners.forEach((cb) => cb());
    });
  return loading;
}

export function onAudioIndexChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 本机有多少条 AI 语音（索引还没读完时为 0） */
export function audioCount(): number {
  return known?.size ?? 0;
}

export function hasAudio(text: string): boolean {
  return !!known?.has(audioKey(text));
}

export async function getAudio(text: string): Promise<StoredAudio | undefined> {
  if (!hasAudio(text)) return undefined;
  const db = await openDb();
  return (await done(db.transaction(STORE).objectStore(STORE).get(audioKey(text)))) as StoredAudio | undefined;
}

export async function putAudio(items: StoredAudio[]): Promise<void> {
  if (!items.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const it of items) tx.objectStore(STORE).put(it);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("保存语音失败"));
    tx.onabort = () => reject(tx.error?.name === "QuotaExceededError" ? new Error("浏览器存储空间不足，语音没有全部保存") : (tx.error ?? new Error("保存语音被中止")));
  });
  known ??= new Set();
  for (const it of items) known.add(it.key);
  listeners.forEach((cb) => cb());
}

/** 测试用 */
export function resetAudioStoreForTests() {
  known = null;
  loading = null;
  dbPromise = null;
}
