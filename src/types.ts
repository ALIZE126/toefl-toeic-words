/** 练习轨道：同一义项的三种练习各自独立排期 */
export type TrackKind = "listening" | "context" | "text";

/** 自编例句 / 原题例句 */
export type ExampleKind = "self" | "original";

export interface ListenQuestion {
  /** 中文提问，不包含目标词 */
  prompt: string;
  /** 选项，answer 为正确选项下标 */
  options: string[];
  answer: number;
}

export interface Example {
  id: string;
  /** 英文句子 */
  text: string;
  /** 中文翻译（可选） */
  zh?: string;
  /** learn = 学习句；test = 复测句（听力 / 新句理解使用） */
  role: "learn" | "test";
  kind: ExampleKind;
  /** 原题例句的出处 */
  source?: string;
  listenQ?: ListenQuestion;
}

export interface Sense {
  id: string;
  /** 词性，如 n. / v. / adj.；原始释义没有词性时为空 */
  pos: string;
  /** 学习用的中文义项（可编辑） */
  gloss: string;
  /** 多义词的英文语境提示，文字回忆时显示，帮助区分义项 */
  cue?: string;
  examples: Example[];
  origin: "auto" | "curated" | "user";
}

export interface SpellingCheck {
  suggestion?: string;
  reason: string;
  status: "pending" | "confirmed" | "dismissed";
}

export interface Entry {
  /** 由原始单词规范化得到，重复导入时用于匹配 */
  id: string;
  /** 原始单词（来自词本，不修改） */
  word: string;
  /** 原始音标 */
  phonetic: string;
  /** 原始中文释义 */
  meaning: string;
  /** 确认拼写更正后的写法（显示和发音都用它） */
  correctedWord?: string;
  spelling?: SpellingCheck;
  senses: Sense[];
  collocations: string[];
  /** 题目来源，例如「TPO 54 听力 L2」 */
  questionSource: string;
  note: string;
  /** 是否属于内置的 30 个配好练习的词条 */
  curated: boolean;
  source: { file: string; row: number; firstImportedAt: string; lastImportedAt: string };
  createdAt: string;
  updatedAt: string;
}

export type Grade = "pass" | "hard" | "fail";

/** 文字回忆自评 */
export type TextResult = "good" | "hard" | "again";
/** 无字幕听力：首听听懂 / 重听才懂 / 看字幕才懂 */
export type ListenResult = "first" | "replay" | "subtitle";
/** 新句理解 */
export type ContextResult = "correct" | "wrong";
export type AnyResult = TextResult | ListenResult | ContextResult | "learned";

export interface TrackState {
  senseId: string;
  entryId: string;
  kind: TrackKind;
  /** 已通过的复习次数：0 → 第1天，1 → 第3天，2 → 第7天，3 = 已掌握 */
  stage: number;
  /** 下次复习日期 YYYY-MM-DD；已掌握为 null */
  due: string | null;
  introducedOn: string;
  lastReviewedOn?: string;
  lastResult?: AnyResult;
  reviews: number;
  lapses: number;
}

export interface ReviewLog {
  id: string;
  at: string;
  day: string;
  entryId: string;
  senseId: string;
  kind: TrackKind | "learn";
  result: AnyResult;
  /** 是否算作答对（首听听懂 / 新句选对 / 文字想起来） */
  correct: boolean;
  /** 本轮内的重做、初学当天的回忆，不计入排期 */
  practice: boolean;
  plays?: number;
  exampleId?: string;
  /** 语音不可用，改做了文字版 */
  audioFallback?: boolean;
}

export type CardType = "learn" | TrackKind;

export interface Card {
  id: string;
  type: CardType;
  entryId: string;
  senseId: string;
  exampleId?: string;
  /** 初学当天的主动回忆 */
  intro?: boolean;
  /** 答错后在本轮重做 */
  retry?: number;
}

export interface Session {
  day: string;
  queue: Card[];
  index: number;
}

export interface Settings {
  newPerDay: number;
  /** 通勤模式：心里作答，点按钮自评 */
  commuteMode: boolean;
  rate: number;
  voiceURI?: string;
}

export interface ImportRecord {
  at: string;
  file: string;
  total: number;
  added: number;
  updated: number;
  unchanged: number;
}

export interface AppState {
  version: 1;
  entries: Record<string, Entry>;
  /** 词库显示顺序（导入顺序） */
  order: string[];
  tracks: Record<string, TrackState>;
  logs: ReviewLog[];
  settings: Settings;
  imports: ImportRecord[];
  session?: Session;
}
