import type { SpellingCheck } from "../types";

const POS_RE = /(?<![a-zA-Z])(vt\.\s*&\s*vi\.|vt\.|vi\.|v\.|n\.|adj\.|adv\.|prep\.|conj\.|pron\.|num\.|art\.|int\.|interj\.|abbr\.|aux\.)/g;

export interface PosGroup {
  pos: string;
  text: string;
}

/** 把「n.礁，暗礁vt.收帆」拆成按词性分组的释义 */
export function splitByPos(meaning: string): PosGroup[] {
  const m = meaning.replace(/\s+/g, " ").trim();
  if (!m) return [];
  const hits = Array.from(m.matchAll(POS_RE));
  if (!hits.length) return [{ pos: "", text: m }];
  const groups: PosGroup[] = [];
  const head = m.slice(0, hits[0].index).trim();
  if (head) groups.push({ pos: "", text: head });
  hits.forEach((h, i) => {
    const start = (h.index ?? 0) + h[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : m.length;
    const text = m.slice(start, end).trim().replace(/^[,，;；\s]+|[,，;；\s]+$/g, "");
    if (text) groups.push({ pos: h[0].replace(/\s+/g, ""), text });
  });
  return groups;
}

/** 学习用的简短释义：取前几个义项 */
export function shortGloss(text: string, max = 3): string {
  const items = text
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.slice(0, max).join("；");
}

export interface Phonetic {
  uk?: string;
  us?: string;
}

export function parsePhonetic(raw: string): Phonetic {
  const uk = raw.match(/英\s*(\/[^/]+\/|\[[^\]]+\])/);
  const us = raw.match(/美\s*(\/[^/]+\/|\[[^\]]+\])/);
  if (uk || us) return { uk: uk?.[1], us: us?.[1] };
  const any = raw.match(/(\/[^/]+\/|\[[^\]]+\])/);
  return any ? { us: any[1] } : {};
}

/** 常见拼写错误 → 正确写法 */
const KNOWN_FIXES: Record<string, string> = {
  permanet: "permanent",
  permenant: "permanent",
  recieve: "receive",
  seperate: "separate",
  enviroment: "environment",
  goverment: "government",
  occured: "occurred",
  definately: "definitely",
  accomodate: "accommodate",
  untill: "until",
  begining: "beginning",
  beleive: "believe",
  calender: "calendar",
  commited: "committed",
  existance: "existence",
  independant: "independent",
  neccessary: "necessary",
  occassion: "occasion",
  recomend: "recommend",
  sucess: "success",
  tommorow: "tomorrow",
  wierd: "weird",
  agressive: "aggressive",
  apparant: "apparent",
  arguement: "argument",
  concious: "conscious",
  embarass: "embarrass",
  harrass: "harass",
  millenium: "millennium",
  mischievious: "mischievous",
  noticable: "noticeable",
  persistant: "persistent",
  priviledge: "privilege",
  publically: "publicly",
  questionaire: "questionnaire",
  reccomend: "recommend",
  relevent: "relevant",
  resistence: "resistance",
  sieze: "seize",
  supercede: "supersede",
  threshhold: "threshold",
  vaccum: "vacuum",
};

const INFLECTION_RE = /的(名词复数|复数|过去式|过去分词|现在分词|比较级|最高级|第三人称单数)/;

/**
 * 检查疑似拼写错误。
 * 1. 在常见拼写错误表里 → 给出更正建议；
 * 2. 词典没给出音标、释义也不是词形变化（如 valley 的复数）→ 提示确认拼写。
 */
export function checkSpelling(word: string, phonetic: string, meaning: string): SpellingCheck | undefined {
  const w = word.trim().toLowerCase();
  const fix = KNOWN_FIXES[w];
  if (fix && fix !== w) {
    return { suggestion: fix, reason: `「${word}」可能是「${fix}」的拼写错误`, status: "pending" };
  }
  if (!phonetic.trim() && !INFLECTION_RE.test(meaning) && /^[a-z]+$/i.test(w)) {
    return { reason: "词典没有返回音标，请确认拼写是否正确", status: "pending" };
  }
  return undefined;
}
