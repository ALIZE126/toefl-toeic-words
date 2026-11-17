/**
 * 图片的本地存储：IndexedDB（localStorage 只能存字符串、容量约 5 MB，放不下 240 张图片）。
 * 以图片内容的 SHA-256 为键，存 ArrayBuffer + MIME 类型。存 ArrayBuffer 而不是 Blob，是为了兼容旧版 iOS Safari。
 * 词条里只保存 sha256 引用，所以 JSON 备份不包含图片；恢复备份后重新导入同一个图片包即可重新绑定。
 */

const DB_NAME = "toefl-toeic-words-images";
const STORE = "images";

interface Stored {
  sha256: string;
  type: string;
  data: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let dbRef: IDBDatabase | null = null;

export function imageStoreSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!imageStoreSupported()) return Promise.reject(new Error("当前浏览器不支持 IndexedDB，无法保存图片"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "sha256" });
      };
      req.onsuccess = () => {
        const db = req.result;
        dbRef = db;
        // 其他标签页升级或删除数据库时，先关闭连接，避免互相卡住
        db.onversionchange = () => {
          db.close();
          if (dbRef === db) {
            dbRef = null;
            dbPromise = null;
          }
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("打开图片存储失败"));
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

/** 本机已有哪些图片 */
export async function listImageKeys(): Promise<Set<string>> {
  if (!imageStoreSupported()) return new Set();
  const db = await openDb();
  const keys = await done(db.transaction(STORE).objectStore(STORE).getAllKeys());
  return new Set(keys.map(String));
}

export async function putImages(items: { sha256: string; type: string; data: ArrayBuffer }[]): Promise<void> {
  if (!items.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const it of items) store.put({ sha256: it.sha256, type: it.type, data: it.data } satisfies Stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("保存图片失败"));
    tx.onabort = () =>
      reject(tx.error?.name === "QuotaExceededError" ? new Error("浏览器存储空间不足，图片没有全部保存") : (tx.error ?? new Error("保存图片被中止")));
  });
}

const urlCache = new Map<string, string>();

/** 取图片的 object URL；本机没有这张图时返回 null */
export async function getImageUrl(sha256: string): Promise<string | null> {
  const cached = urlCache.get(sha256);
  if (cached) return cached;
  if (!imageStoreSupported()) return null;
  const db = await openDb();
  const rec = (await done(db.transaction(STORE).objectStore(STORE).get(sha256))) as Stored | undefined;
  if (!rec) return null;
  const url = URL.createObjectURL(new Blob([rec.data], { type: rec.type || "image/webp" }));
  urlCache.set(sha256, url);
  return url;
}

/** 请求浏览器把本站数据标记为持久保存，降低被自动清理的概率（不支持时忽略） */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 忽略 */
  }
}

/** 测试用：清空缓存和连接 */
export function resetImageStoreForTests() {
  urlCache.clear();
  dbRef?.close();
  dbRef = null;
  dbPromise = null;
}
