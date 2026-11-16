import type { AppState, Entry, Example, ListenQuestion, Sense } from "../types";
import { seededShuffle } from "./util";

export interface Choice {
  text: string;
  correct: boolean;
}

/** 新句理解：判断目标词在这句话里的意思。多义词把其他义项作为干扰项 */
export function contextChoices(state: AppState, entry: Entry, sense: Sense, seed: string): Choice[] {
  const correct = sense.gloss.trim();
  const picked = new Set<string>([correct]);
  const distractors: string[] = [];
  for (const s of entry.senses) {
    const g = s.gloss.trim();
    if (s.id !== sense.id && g && !picked.has(g)) {
      picked.add(g);
      distractors.push(g);
    }
  }
  // 再从其他词条中补充同词性的释义
  const pool: string[] = [];
  const posHead = sense.pos.replace(/[^a-z]/g, "").slice(0, 1);
  for (const id of state.order) {
    if (id === entry.id) continue;
    for (const s of state.entries[id]?.senses ?? []) {
      const g = s.gloss.trim();
      if (!g || picked.has(g) || g.length > 18) continue;
      if (posHead && s.pos && !s.pos.startsWith(posHead)) continue;
      pool.push(g);
    }
  }
  for (const g of seededShuffle(pool, seed)) {
    if (distractors.length >= 3) break;
    if (!picked.has(g)) {
      picked.add(g);
      distractors.push(g);
    }
  }
  const choices: Choice[] = [{ text: correct, correct: true }, ...distractors.slice(0, 3).map((t) => ({ text: t, correct: false }))];
  return seededShuffle(choices, seed);
}

/** 听力题：使用例句自带的中文理解题；没有时退化为「关键词意思」题 */
export function listenChoices(state: AppState, entry: Entry, sense: Sense, ex: Example, seed: string): { prompt: string; choices: Choice[] } {
  const q: ListenQuestion | undefined = ex.listenQ;
  const opts = (q?.options ?? []).map((t, i) => ({ text: t.trim(), correct: i === q!.answer })).filter((o) => o.text);
  if (q && q.prompt.trim() && opts.length >= 2 && opts.some((o) => o.correct)) {
    return { prompt: q.prompt.trim(), choices: seededShuffle(opts, seed) };
  }
  return { prompt: "这句话里的关键词是什么意思？", choices: contextChoices(state, entry, sense, seed) };
}
