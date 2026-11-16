/** 本地日期 YYYY-MM-DD */
export function toDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return toDay(new Date(y, m - 1, d + n));
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * 今天的日期。URL 带 ?today=YYYY-MM-DD 时使用该日期，方便模拟隔天复习。
 */
export function getToday(): string {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("today");
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  }
  return toDay();
}

export function normalizeWord(w: string): string {
  return w.trim().toLowerCase().replace(/\s+/g, " ");
}

let counter = 0;
export function uid(prefix = ""): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 简单字符串哈希，用于可复现的选项打乱 */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = arr.slice();
  let x = hash(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 把句子拆成片段，标出目标词（含常见词形变化，如 postponed / properties）。
 */
export function splitHighlight(sentence: string, word: string): { text: string; hit: boolean }[] {
  const w = word.trim().toLowerCase();
  if (!w) return [{ text: sentence, hit: false }];
  let stem = w;
  if (!w.includes(" ") && w.length > 4 && /[ey]$/.test(w)) stem = w.slice(0, -1);
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const re = new RegExp(`\\b${escaped}[a-z]*`, "gi");
  const parts: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of sentence.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: sentence.slice(last, i), hit: false });
    parts.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), hit: false });
  return parts;
}
