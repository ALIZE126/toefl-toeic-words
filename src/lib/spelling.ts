import type { AppState, TrackState } from "../types";
import { PASSAGES } from "../data/passages";
import { splitHighlight } from "./util";

/** 拼写复习用的一句话：form 是句中实际词形，复习时挖掉它的后半部分 */
export interface SpellingItem {
  id: string;
  text: string;
  form: string;
  zh?: string;
}

/** 短文里含目标词的那一句（拼错时记为「上次用过的句子」） */
export function passageSentenceId(passageId: string, form: string): string {
  return `ps:${passageId}:${form}`;
}

function sentenceWith(text: string, form: string): string | undefined {
  const re = new RegExp(`\\b${form}\\b`, "i");
  return text.match(/[^.!?]+[.!?]/g)?.map((s) => s.trim()).find((s) => re.test(s));
}

function findForm(text: string, form: string | undefined, word: string): string | undefined {
  if (form) return new RegExp(`\\b${form}\\b`, "i").test(text) ? text.match(new RegExp(`\\b${form}\\b`, "i"))![0] : undefined;
  return splitHighlight(text, word).find((p) => p.hit)?.text;
}

/**
 * 某个义项可用来考拼写的句子：短文目标词的备用句 → 义项例句 → 短文原句。
 * 只收录确实包含目标词（某种词形）的句子。
 */
export function spellingItems(state: AppState, entryId: string, senseId: string): SpellingItem[] {
  const entry = state.entries[entryId];
  if (!entry) return [];
  const sense = entry.senses.find((s) => s.id === senseId);
  const items: SpellingItem[] = [];
  const seen = new Set<string>();
  const push = (it: SpellingItem) => {
    const key = it.text.trim().toLowerCase();
    if (!it.form || seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };
  const targets = PASSAGES.flatMap((p) => p.targets.map((t) => ({ p, t }))).filter(
    ({ t }) => t.entryId === entryId && (t.senseId === senseId || !entry.senses.some((s) => s.id === t.senseId)),
  );
  for (const { p, t } of targets) {
    t.alt.forEach((a, i) => {
      const form = findForm(a.text, a.form ?? t.form, entry.word) ?? findForm(a.text, undefined, entry.word);
      if (form) push({ id: `alt:${p.id}:${t.form}:${i}`, text: a.text, form, zh: a.zh });
    });
  }
  for (const x of sense?.examples ?? []) {
    const form = findForm(x.text, undefined, entry.word);
    if (form && /^[A-Za-z]{2,}$/.test(form)) push({ id: `ex:${x.id}`, text: x.text, form, zh: x.zh });
  }
  for (const { p, t } of targets) {
    const s = sentenceWith(p.text, t.form);
    if (s) push({ id: passageSentenceId(p.id, t.form), text: s, form: findForm(s, t.form, entry.word)! });
  }
  return items;
}

/** 下次优先用和上次不同的句子来考 */
export function pickSpellingItem(state: AppState, t: TrackState): SpellingItem | undefined {
  const all = spellingItems(state, t.entryId, t.senseId);
  if (!all.length) return undefined;
  const fresh = all.filter((i) => i.id !== t.lastItem);
  const pool = fresh.length ? fresh : all;
  return pool[t.reviews % pool.length];
}
