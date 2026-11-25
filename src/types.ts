/** 练习轨道：同一义项的各种练习各自独立排期（spelling = 拼写，来自托福阅读补全单词） */
export type TrackKind = "listening" | "context" | "text" | "spelling" | "part1";

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
  /** 来自托业 Part 1 图片词库的资料（按 phrase_id 绑定） */
  part1?: Part1Sense;
}

/** 托业 Part 1 题目出处 */
export interface Part1Source {
  sourceId: string;
  book: number;
  test: number;
  question: number;
  option: string;
  sentence: string;
  /** 正确选项 / 干扰项 / 答案未核实 */
  answerStatus: string;
  pdfFile?: string;
  pdfPage?: number;
  actualForm?: string;
  clue?: string;
  caution?: string;
}

export interface Part1Image {
  /** 图片内容的 SHA-256，也是 IndexedDB 里的键 */
  sha256: string;
  path: string;
  width?: number;
  height?: number;
  /** 场景参考句（核对配图用） */
  sceneEn?: string;
  cue?: string;
  caution?: string;
  /** paired_photo_reviewed = 已和对照图一起审核 */
  matchQuality?: string;
}

export interface Part1Sense {
  phraseId: string;
  /** 人物动作 / 物体状态 / 位置关系 */
  categories: string[];
  observedForms: string[];
  visualClues: string[];
  visualCautions: string[];
  trainingNote?: string;
  contrastWarning?: string;
  sources: Part1Source[];
  image?: Part1Image;
  priorityRank?: number | null;
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
  /** 所在词库 */
  decks: DeckId[];
  /** 来自托福阅读词汇册 */
  reading?: ReadingInfo;
  source: { file: string; row: number; firstImportedAt: string; lastImportedAt: string };
  createdAt: string;
  updatedAt: string;
}

/** 词库：托福 / 托业。一个词可以同时属于两个词库，复习进度共享 */
export type DeckId = "toefl" | "toeic";
export type DeckFilter = DeckId | "all";

export type ReadingTier = "先背" | "进阶" | "话题识别";

export interface ReadingInfo {
  itemId: string;
  tier: ReadingTier;
  /** 在题库里出现的篇数 */
  count: number;
  /** 题库总篇数 */
  materials?: number;
  rank?: number;
  forms: string[];
  glossType?: string;
  sourceTitle?: string;
  sourceKind?: string;
  kind: "word" | "phrase";
}

export type Grade = "pass" | "hard" | "fail";

/** 文字回忆自评 */
export type TextResult = "good" | "hard" | "again";
/** 无字幕听力：首听听懂 / 重听才懂 / 看字幕才懂 */
export type ListenResult = "first" | "replay" | "subtitle";
/** Part 1 听音选图：首听答对 / 重听后答对 / 答错 */
export type Part1Result = "first" | "replay" | "wrong";
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
  /** 上次考这个轨道用的句子 / 例句 ID（拼写复习下次优先换一句） */
  lastItem?: string;
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
  /** 来自哪篇补全单词短文 */
  passageId?: string;
  /** Part 1 听音选图答错时选中的图片对应的 phrase_id */
  chosen?: string;
  /** 本轮内重做（答错后隔几题再出现） */
  retry?: boolean;
  /** 自由练习 */
  free?: boolean;
  /** 这次作答的唯一标识（= 卡片 ID）。同一张卡重复提交只记一次 */
  attemptId?: string;
}

/** 托福阅读 · 补全单词：一次整篇作答 */
export interface PassageAttempt {
  id: string;
  passageId: string;
  at: string;
  day: string;
  /** 10 空中答对几空（目标词和普通词都算） */
  score: number;
  total: number;
  targetCorrect: number;
  targetTotal: number;
  answers: { input: string; correct: boolean }[];
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
  /** 自由练习：不计入排期和正确率 */
  free?: boolean;
  /** Part 1 自动出的练习题：播报句和两张图（phrase_id），只做练习 */
  p1?: { audio: string; options: string[]; correct: string };
}

export interface Session {
  day: string;
  /** daily = 今日复习；part1 = 托业 Part 1 听音选图专项 */
  scope?: "daily" | "part1";
  /** 本轮复习的词库范围 */
  deck?: DeckFilter;
  queue: Card[];
  index: number;
  /** 当前卡片的作答阶段（刷新或退出后恢复用） */
  ui?: { cardId: string; data: Record<string, unknown> };
  /** 已提交的卡片：cardId → 结果（每张卡只提交一次） */
  answered?: Record<string, { result: AnyResult; fallback?: boolean }>;
}

export interface Settings {
  newPerDay: number;
  /** 通勤模式：心里作答，点按钮自评 */
  commuteMode: boolean;
  rate: number;
  voiceURI?: string;
  /** 播放前先用一段静音的媒体播放把耳机（AirPods）切到这台设备；未设置时 iPhone / iPad 默认开启 */
  audioHandoff?: boolean;
  /** 有 AI 语音（音频包）的句子优先播放 AI 语音，默认开启 */
  aiVoice?: boolean;
  /** Part 1 练习题每轮题数，0 = 全部 */
  part1PracticeCount?: number;
  /** 顶部选中的词库（今日复习 / 词库 / 学习记录按它筛选） */
  deck: DeckFilter;
}

export interface ImportRecord {
  at: string;
  file: string;
  total: number;
  added: number;
  updated: number;
  unchanged: number;
  /** addOnly = 只新增词库里没有的词；merge = 同时更新已有词的原始音标 / 释义 */
  mode?: ImportMode;
  /** 导入到哪个词库 */
  deck?: DeckId;
  /** 已有词条中，本次新加入这个词库的数量 */
  deckAdded?: number;
}

export type ImportMode = "addOnly" | "merge";

export interface AppState {
  version: 1;
  /** 存储结构版本（增量迁移用，见 storage.ts） */
  schema?: number;
  /** 托福补词：每篇短文未提交的输入 */
  readingDrafts?: Record<string, string[]>;
  /** 看图学短语：上次看到第几张 */
  part1Study?: { index: number; category?: string };
  entries: Record<string, Entry>;
  /** 词库显示顺序（导入顺序） */
  order: string[];
  tracks: Record<string, TrackState>;
  logs: ReviewLog[];
  settings: Settings;
  imports: ImportRecord[];
  passageAttempts: PassageAttempt[];
  /** 托业 Part 1 图片词库：可判分的听音选图题、对照组、导入记录（图片本身在 IndexedDB） */
  part1?: Part1State;
  session?: Session;
}

export interface Part1Question {
  /** 稳定键：组 ID + 序号，例如 part1-reach-hold-cup-study/q1 */
  key: string;
  audioText: string;
  correctPhraseId: string;
}

export interface Part1Group {
  id: string;
  phraseIds: string[];
  randomize: boolean;
  questions: Part1Question[];
  /** 通过校验（对照图齐全、互斥已审核、每句只对应一张图）才进入正式复习 */
  eligible: boolean;
  reasons: string[];
}

export interface Part1ContrastGroup {
  id: string;
  title: string;
  phrases: string[];
  phraseIds: string[];
  suitability: string;
}

export interface Part1PackRecord {
  at: string;
  file: string;
  version?: string;
  phrases: number;
  images: number;
}

export interface Part1State {
  groups: Part1Group[];
  contrastGroups: Part1ContrastGroup[];
  packs: Part1PackRecord[];
}
