import type { AppState, Entry, Example, ImportRecord, Sense } from "../types";
import type { RawRow } from "./docx";
import { CURATED_BY_WORD, type CuratedEntry } from "../data/curated";
import { checkSpelling, shortGloss, splitByPos } from "./meaning";
import { normalizeWord, uid } from "./util";

export function entryIdFor(word: string): string {
  return normalizeWord(word);
}

/** 由原始释义生成默认学习义项：每个词性一个义项 */
export function autoSenses(entryId: string, meaning: string): Sense[] {
  const groups = splitByPos(meaning);
  if (!groups.length) return [{ id: `${entryId}#1`, pos: "", gloss: "", examples: [], origin: "auto" }];
  return groups.map((g, i) => ({
    id: `${entryId}#${i + 1}`,
    pos: g.pos,
    gloss: shortGloss(g.text),
    examples: [],
    origin: "auto",
  }));
}

export function curatedSenses(entryId: string, c: CuratedEntry): Sense[] {
  return c.senses.map((s) => {
    const sid = `${entryId}#${s.key}`;
    const examples: Example[] = [
      { id: `${sid}/learn`, text: s.learn.text, zh: s.learn.zh, role: "learn", kind: "self" },
      ...s.tests.map(
        (t, i): Example => ({
          id: `${sid}/test${i + 1}`,
          text: t.text,
          zh: t.zh,
          role: "test",
          kind: "self",
          listenQ: { prompt: t.q, options: [...t.options], answer: 0 },
        }),
      ),
    ];
    return { id: sid, pos: s.pos, gloss: s.gloss, cue: s.cue, examples, origin: "curated" };
  });
}

export function displayWord(e: Entry): string {
  return e.spelling?.status === "confirmed" && e.correctedWord ? e.correctedWord : e.word;
}

function newEntry(r: RawRow, file: string, now: string): Entry {
  const id = entryIdFor(r.word);
  const c = CURATED_BY_WORD[id];
  return {
    id,
    word: r.word,
    phonetic: r.phonetic,
    meaning: r.meaning,
    spelling: checkSpelling(r.word, r.phonetic, r.meaning),
    senses: c ? curatedSenses(id, c) : autoSenses(id, r.meaning),
    collocations: c ? [...c.collocations] : [],
    questionSource: "",
    note: "",
    curated: !!c,
    source: { file, row: r.row, firstImportedAt: now, lastImportedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

export interface ImportReport extends ImportRecord {
  /** 重复导入时，原始内容发生变化的词条 */
  changedWords: string[];
  /** 文件内重复出现的单词（只导入第一次出现的） */
  duplicatesInFile: string[];
  spellingFlags: number;
}

/**
 * 导入词本行。已有词条（按单词匹配）保留其学习义项、例句和复习进度，
 * 只更新原始音标 / 释义并记录变化。
 */
export function importRows(state: AppState, rows: RawRow[], file: string, now = new Date().toISOString()): { state: AppState; report: ImportReport } {
  const entries = { ...state.entries };
  const order = [...state.order];
  const seen = new Set<string>();
  const duplicatesInFile: string[] = [];
  const changedWords: string[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const r of rows) {
    const id = entryIdFor(r.word);
    if (seen.has(id)) {
      duplicatesInFile.push(r.word);
      continue;
    }
    seen.add(id);
    const old = entries[id];
    if (!old) {
      entries[id] = newEntry(r, file, now);
      order.push(id);
      added++;
      continue;
    }
    const changed = old.phonetic !== r.phonetic || old.meaning !== r.meaning;
    const next: Entry = {
      ...old,
      phonetic: r.phonetic,
      meaning: r.meaning,
      source: { ...old.source, file, row: r.row, lastImportedAt: now },
    };
    if (changed) {
      next.updatedAt = now;
      // 用户没改过的自动义项随原始释义更新；已编辑或有进度的义项保持不变
      const untouched = old.senses.every((s) => s.origin === "auto" && s.examples.length === 0);
      const hasProgress = Object.values(state.tracks).some((t) => t.entryId === id);
      if (untouched && !hasProgress) next.senses = autoSenses(id, r.meaning);
      if (!old.spelling || old.spelling.status === "pending") next.spelling = checkSpelling(r.word, r.phonetic, r.meaning);
      changedWords.push(r.word);
      updated++;
    } else {
      unchanged++;
    }
    entries[id] = next;
    if (!order.includes(id)) order.push(id);
  }

  const record: ImportRecord = { at: now, file, total: rows.length, added, updated, unchanged };
  const report: ImportReport = {
    ...record,
    changedWords,
    duplicatesInFile,
    spellingFlags: Object.values(entries).filter((e) => e.spelling?.status === "pending").length,
  };
  return { state: { ...state, entries, order, imports: [...state.imports, record] }, report };
}

export function updateEntry(state: AppState, id: string, patch: Partial<Entry>): AppState {
  const old = state.entries[id];
  if (!old) return state;
  return { ...state, entries: { ...state.entries, [id]: { ...old, ...patch, updatedAt: new Date().toISOString() } } };
}

export function newSenseId(entry: Entry): string {
  return `${entry.id}#u${uid()}`;
}

export function newExampleId(senseId: string): string {
  return `${senseId}/x${uid()}`;
}

/** 删除义项时一并清理它的复习进度 */
export function removeSense(state: AppState, entryId: string, senseId: string): AppState {
  const e = state.entries[entryId];
  if (!e) return state;
  const tracks = Object.fromEntries(Object.entries(state.tracks).filter(([, t]) => t.senseId !== senseId));
  const s1 = updateEntry({ ...state, tracks }, entryId, { senses: e.senses.filter((s) => s.id !== senseId) });
  return s1;
}

export function learnExample(s: Sense): Example | undefined {
  return s.examples.find((x) => x.role === "learn" && x.text.trim());
}

export function testExamples(s: Sense): Example[] {
  const learn = learnExample(s);
  return s.examples.filter((x) => x.role === "test" && x.text.trim() && x.text.trim() !== learn?.text.trim());
}

/** 有学习句的义项可以初学；有不同的复测句才能做听力和新句理解 */
export function senseReady(s: Sense): { learn: boolean; test: boolean } {
  return { learn: !!learnExample(s) && !!s.gloss.trim(), test: testExamples(s).length > 0 };
}
