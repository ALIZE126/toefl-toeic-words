import type { AppState, DeckFilter, DeckId, Entry } from "../types";

export const DECKS: { id: DeckId; name: string }[] = [
  { id: "toefl", name: "托福" },
  { id: "toeic", name: "托业" },
];

export const DECK_NAME: Record<DeckFilter, string> = { all: "全部", toefl: "托福", toeic: "托业" };

/** 分词库之前导入的词条没有 decks 字段：归入托福词库（附件生词本以托福学术词为主） */
export const LEGACY_DECK: DeckId = "toefl";

export function entryDecks(e: Entry): DeckId[] {
  return e.decks?.length ? e.decks : [LEGACY_DECK];
}

export function inDeck(e: Entry, deck: DeckFilter): boolean {
  return deck === "all" || entryDecks(e).includes(deck);
}

export function deckCount(state: AppState, deck: DeckFilter): number {
  return state.order.filter((id) => state.entries[id] && inDeck(state.entries[id], deck)).length;
}

/**
 * 只保留某个词库的词条、进度和作答记录。用于今日复习、词库列表和学习记录。
 * 同一个词可以同时在两个词库里，进度是共享的。设置、导入记录和补全单词短文成绩不受影响。
 */
export function scopeState(state: AppState, deck: DeckFilter): AppState {
  if (deck === "all") return state;
  const entries: AppState["entries"] = {};
  for (const id of state.order) {
    const e = state.entries[id];
    if (e && inDeck(e, deck)) entries[id] = e;
  }
  const keep = (id: string) => id in entries;
  return {
    ...state,
    entries,
    order: state.order.filter(keep),
    tracks: Object.fromEntries(Object.entries(state.tracks).filter(([, t]) => keep(t.entryId))),
    logs: state.logs.filter((l) => keep(l.entryId)),
  };
}

/** 读取旧数据时补上 decks 字段 */
export function migrateDecks(state: AppState): AppState {
  let changed = false;
  const entries: AppState["entries"] = {};
  for (const [id, e] of Object.entries(state.entries)) {
    if (e.decks?.length) entries[id] = e;
    else {
      entries[id] = { ...e, decks: [LEGACY_DECK] };
      changed = true;
    }
  }
  return changed ? { ...state, entries } : state;
}
