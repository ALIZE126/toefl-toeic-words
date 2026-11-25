/**
 * 托福阅读词汇册（阅读词汇数据.json）导入。
 * 每条：单词或搭配、释义、音标、词形、分层（先背 / 进阶 / 话题识别）、出现篇数、一句原题例句和出处。
 * 导入到托福词库；已有的词复用（意思相同的义项补上原题例句），编辑内容和进度保留。
 */
import type { AppState, Entry, Example, ReadingInfo, ReadingTier, Sense } from "../types";
import { entryDecks } from "./decks";
import { checkSpelling, shortGloss, splitByPos } from "./meaning";
import { sameSense } from "./part1";
import { normalizeWord } from "./util";

export const TIERS: ReadingTier[] = ["先背", "进阶", "话题识别"];
export const TIER_RANK: Record<ReadingTier, number> = { 先背: 0, 进阶: 1, 话题识别: 2 };

interface RawItem {
  id: string;
  word: string;
  kind?: string;
  meaning: string;
  gloss_type?: string;
  phonetic?: string;
  priority?: string;
  count?: number;
  rank?: number;
  forms?: string[];
  note?: string;
  example?: string;
  source?: { title?: string; kind?: string };
}

export interface ReadingPack {
  file: string;
  materials?: number;
  snapshot?: string;
  items: RawItem[];
  skipped: number;
}

export function parseReadingVocab(text: string, file: string): ReadingPack {
  let d: { summary?: { materials?: number; snapshot?: string }; items?: unknown[] };
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }
  if (!Array.isArray(d?.items)) throw new Error("文件里没有 items 列表（请选择「阅读词汇数据.json」）");
  const items: RawItem[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const x of d.items as RawItem[]) {
    if (!x || typeof x.word !== "string" || !x.word.trim() || typeof x.meaning !== "string" || typeof x.id !== "string") {
      skipped++;
      continue;
    }
    const k = normalizeWord(x.word);
    if (seen.has(k)) {
      skipped++;
      continue;
    }
    seen.add(k);
    items.push(x);
  }
  if (!items.length) throw new Error("文件里没有可导入的词条");
  return { file, materials: d.summary?.materials, snapshot: d.summary?.snapshot, items, skipped };
}

const tierOf = (x: RawItem): ReadingTier => (TIERS.includes(x.priority as ReadingTier) ? (x.priority as ReadingTier) : "话题识别");

/** 学习用义项：整理释义原样；词典参考义每个词性只取前 2 个意思 */
export function readingGloss(x: Pick<RawItem, "meaning" | "gloss_type">): { pos: string; gloss: string } {
  const m = x.meaning.replace(/\s+/g, " ").trim();
  const groups = splitByPos(m.replace(/(?<![a-z])a\./g, "adj."));
  if (!groups.length) return { pos: "", gloss: m };
  const per = x.gloss_type === "整理释义" ? 4 : 2;
  if (groups.length === 1) return { pos: groups[0].pos, gloss: shortGloss(groups[0].text, per) };
  return { pos: "", gloss: groups.slice(0, 3).map((g) => `${g.pos}${shortGloss(g.text, per)}`).join("；") };
}

function info(x: RawItem, materials?: number): ReadingInfo {
  return {
    itemId: x.id,
    tier: tierOf(x),
    count: x.count ?? 0,
    materials,
    rank: x.rank,
    forms: x.forms ?? [],
    glossType: x.gloss_type,
    sourceTitle: x.source?.title,
    sourceKind: x.source?.kind,
    kind: x.kind === "搭配" ? "phrase" : "word",
  };
}

function exampleOf(senseId: string, x: RawItem, role: Example["role"]): Example | undefined {
  const t = x.example?.trim();
  if (!t) return undefined;
  return {
    id: `${senseId}/rv-${x.id.slice(0, 10)}`,
    text: t,
    role,
    kind: "original",
    source: `托福阅读 · ${x.source?.title ?? "原题"}${x.source?.kind ? `（${x.source.kind}）` : ""}`,
  };
}

export interface ReadingPlan {
  /** 选中的分层里，新建 / 复用已有词条 / 之前导入过 */
  create: RawItem[];
  reuse: { item: RawItem; entryId: string; senseGloss?: string }[];
  already: RawItem[];
  byTier: Record<ReadingTier, number>;
}

function findEntryId(state: AppState, word: string): string | undefined {
  const id = normalizeWord(word);
  if (state.entries[id]) return id;
  return Object.values(state.entries).find((e) => e.spelling?.status === "confirmed" && e.correctedWord && normalizeWord(e.correctedWord) === id)?.id;
}

export function planReadingImport(state: AppState, pack: ReadingPack, tiers: ReadingTier[]): ReadingPlan {
  const plan: ReadingPlan = { create: [], reuse: [], already: [], byTier: { 先背: 0, 进阶: 0, 话题识别: 0 } };
  for (const x of pack.items) {
    if (!tiers.includes(tierOf(x))) continue;
    plan.byTier[tierOf(x)]++;
    const id = findEntryId(state, x.word);
    const e = id ? state.entries[id] : undefined;
    if (e?.reading?.itemId === x.id) plan.already.push(x);
    else if (e) plan.reuse.push({ item: x, entryId: e.id, senseGloss: e.senses.find((s) => sameSense(s.gloss, x.meaning))?.gloss });
    else plan.create.push(x);
  }
  return plan;
}

export interface ReadingReport {
  file: string;
  added: number;
  reused: number;
  examplesAdded: number;
  already: number;
}

/** 写入词库（纯函数）。新词按 先背 → 进阶 → 话题识别、出现篇数从多到少排在词库末尾 */
export function applyReadingImport(state: AppState, pack: ReadingPack, plan: ReadingPlan, now = new Date().toISOString()): { state: AppState; report: ReadingReport } {
  const entries = { ...state.entries };
  const order = [...state.order];
  let examplesAdded = 0;
  const sorted = [...plan.create].sort((a, b) => TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)] || (b.count ?? 0) - (a.count ?? 0));
  sorted.forEach((x, i) => {
    const id = normalizeWord(x.word);
    const senseId = `${id}#rv`;
    const g = readingGloss(x);
    const ex = exampleOf(senseId, x, "learn");
    const phonetic = x.phonetic ? `/${x.phonetic}/` : "";
    const sense: Sense = { id: senseId, pos: g.pos, gloss: g.gloss, examples: ex ? [ex] : [], origin: "auto" };
    const entry: Entry = {
      id,
      word: x.word.trim(),
      phonetic,
      meaning: x.meaning,
      spelling: x.kind === "搭配" ? undefined : checkSpelling(x.word, phonetic, x.meaning),
      senses: [sense],
      collocations: [],
      questionSource: `托福阅读 · ${x.count ?? 0}${pack.materials ? ` / ${pack.materials}` : ""} 篇${x.source?.title ? ` · ${x.source.title}` : ""}`,
      note: x.note ?? "",
      curated: false,
      decks: ["toefl"],
      reading: info(x, pack.materials),
      source: { file: pack.file, row: i + 1, firstImportedAt: now, lastImportedAt: now },
      createdAt: now,
      updatedAt: now,
    };
    if (ex && entry.spelling && !entry.spelling.suggestion) entry.spelling = undefined; // 有原题例句的不算疑似拼写
    entries[id] = entry;
    order.push(id);
  });
  for (const { item: x, entryId } of plan.reuse) {
    const old = entries[entryId];
    if (!old) continue;
    let senses = old.senses;
    const text = x.example?.trim();
    const hasText = (s: Sense) => s.examples.some((e) => e.text.trim() === text);
    const match = old.senses.find((s) => sameSense(s.gloss, x.meaning) && !s.part1) ?? old.senses.find((s) => sameSense(s.gloss, x.meaning));
    if (text && !old.senses.some(hasText)) {
      if (match) {
        // 意思相同的义项：没有学习句就当学习句，有了就当复测句（可以做听力和新句理解）
        const role: Example["role"] = match.examples.some((e) => e.role === "learn") ? "test" : "learn";
        const ex = exampleOf(match.id, x, role)!;
        senses = old.senses.map((s) => (s.id === match.id ? { ...s, examples: [...s.examples, ex] } : s));
      } else {
        const sid = `${old.id}#rv`;
        const g = readingGloss(x);
        senses = [...old.senses, { id: sid, pos: g.pos, gloss: g.gloss, examples: [exampleOf(sid, x, "learn")!], origin: "auto" }];
      }
      examplesAdded++;
    }
    const decks = entryDecks(old);
    entries[entryId] = {
      ...old,
      senses,
      decks: decks.includes("toefl") ? decks : [...decks, "toefl"],
      reading: old.reading ?? info(x, pack.materials),
      note: old.note || x.note || "",
      updatedAt: now,
    };
  }
  return {
    state: { ...state, entries, order, imports: [...state.imports, { at: now, file: pack.file, total: pack.items.length, added: sorted.length, updated: plan.reuse.length, unchanged: plan.already.length, deck: "toefl" }] },
    report: { file: pack.file, added: sorted.length, reused: plan.reuse.length, examplesAdded, already: plan.already.length },
  };
}
