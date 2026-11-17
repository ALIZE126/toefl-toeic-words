import type {
  AnyResult,
  AppState,
  Card,
  Entry,
  Grade,
  ReviewLog,
  Sense,
  Session,
  TrackKind,
  TrackState,
} from "../types";
import { learnExample, senseReady, testExamples } from "./library";
import { addDays, uid } from "./util";
import { pickSpellingItem } from "./spelling";
import { part1Questions, pickPart1Question } from "./part1";

/** 初学后的第 1、3、7 天复习 */
export const REVIEW_DAYS = [1, 3, 7] as const;
export const MASTERED_STAGE = REVIEW_DAYS.length;
/** 答错后隔几题再出现 */
export const RETRY_GAP = 3;
export const MAX_RETRY = 3;

export const KIND_ORDER: TrackKind[] = ["listening", "part1", "context", "text", "spelling"];

export const KIND_LABEL: Record<TrackKind, string> = {
  listening: "无字幕听力",
  context: "新句理解",
  text: "文字回忆",
  spelling: "拼写",
  part1: "Part 1 听音选图",
};

export const RESULT_LABEL: Record<AnyResult, string> = {
  good: "想起来了",
  hard: "有点模糊",
  again: "没想起来",
  first: "首听听懂",
  replay: "重听才懂",
  subtitle: "看字幕才懂",
  correct: "答对",
  wrong: "答错",
  learned: "初学",
};

/** 同一个结果在不同练习里的叫法 */
export function resultLabel(kind: TrackKind | "learn", result: AnyResult): string {
  if (kind === "part1") return result === "first" ? "首听答对" : result === "replay" ? "重听后答对" : "答错";
  return RESULT_LABEL[result];
}

export function trackKey(senseId: string, kind: TrackKind): string {
  return `${senseId}|${kind}`;
}

export function toGrade(result: AnyResult): Grade {
  switch (result) {
    case "good":
    case "first":
    case "correct":
    case "learned":
      return "pass";
    case "hard":
    case "replay":
      return "hard";
    default:
      return "fail";
  }
}

export function isCorrect(result: AnyResult): boolean {
  return toGrade(result) === "pass";
}

/** 按评分推进一个练习轨道的排期 */
export function applyGrade(t: TrackState, grade: Grade, day: string, result: AnyResult): TrackState {
  const next: TrackState = { ...t, reviews: t.reviews + 1, lastReviewedOn: day, lastResult: result };
  if (grade === "pass") {
    const prev = t.stage;
    next.stage = Math.min(prev + 1, MASTERED_STAGE);
    next.due = next.stage >= MASTERED_STAGE ? null : addDays(day, REVIEW_DAYS[next.stage] - REVIEW_DAYS[prev]);
  } else if (grade === "hard") {
    // 重听才懂 / 有点模糊：不升级，次日再练
    next.due = addDays(day, 1);
  } else {
    // 答错 / 看字幕才懂：从第 1 天重新开始，次日复习
    next.stage = 0;
    next.lapses = t.lapses + 1;
    next.due = addDays(day, 1);
  }
  return next;
}

export type TrackStatus = "none" | "due" | "learning" | "mastered";

export function trackStatus(t: TrackState | undefined, today: string): TrackStatus {
  if (!t) return "none";
  if (t.stage >= MASTERED_STAGE || t.due === null) return "mastered";
  return t.due <= today ? "due" : "learning";
}

export const STATUS_LABEL: Record<TrackStatus, string> = {
  none: "未学",
  due: "待复习",
  learning: "学习中",
  mastered: "已掌握",
};

export function findSense(state: AppState, entryId: string, senseId: string): { entry: Entry; sense: Sense } | undefined {
  const entry = state.entries[entryId];
  const sense = entry?.senses.find((s) => s.id === senseId);
  return entry && sense ? { entry, sense } : undefined;
}

/** 初学：为义项建立文字 / 听力 / 新句三个轨道，第 1 天复习 */
export function introduce(state: AppState, entryId: string, senseId: string, day: string): AppState {
  const found = findSense(state, entryId, senseId);
  if (!found) return state;
  const ready = senseReady(found.sense);
  const kinds: TrackKind[] = ready.test ? ["listening", "context", "text"] : ["text"];
  const tracks = { ...state.tracks };
  for (const kind of kinds) {
    const k = trackKey(senseId, kind);
    if (tracks[k]) continue;
    tracks[k] = {
      senseId,
      entryId,
      kind,
      stage: 0,
      due: addDays(day, REVIEW_DAYS[0]),
      introducedOn: day,
      reviews: 0,
      lapses: 0,
    };
  }
  const log: ReviewLog = {
    id: uid("l"),
    at: new Date().toISOString(),
    day,
    entryId,
    senseId,
    kind: "learn",
    result: "learned",
    correct: true,
    practice: true,
  };
  return { ...state, tracks, logs: [...state.logs, log] };
}

export interface GradeInput {
  card: Card;
  result: AnyResult;
  day: string;
  plays?: number;
  audioFallback?: boolean;
  /** Part 1 答错时选中的图片对应的 phrase_id */
  chosen?: string;
}

/**
 * 记录一次作答：
 * - 正式复习：更新该轨道排期（其他轨道不受影响）；
 * - 初学当天的回忆、本轮重做、语音不可用时的文字替代：只记日志，不改排期。
 */
export function recordAnswer(state: AppState, input: GradeInput): AppState {
  const { card, result, day } = input;
  if (card.type === "learn") return state;
  const kind = card.type;
  const key = trackKey(card.senseId, kind);
  const practice = !!card.intro || !!card.retry || !!card.free || !!input.audioFallback;
  const tracks = { ...state.tracks };
  if (!practice && !tracks[key] && kind === "part1") {
    // 第一次做这道听音选图：相当于初学，建立轨道，第 1 天复习；结果计入首听正确率
    tracks[key] = {
      senseId: card.senseId,
      entryId: card.entryId,
      kind,
      stage: 0,
      due: addDays(day, REVIEW_DAYS[0]),
      introducedOn: day,
      lastReviewedOn: day,
      lastResult: result,
      reviews: 1,
      lapses: toGrade(result) === "fail" ? 1 : 0,
      lastItem: card.exampleId,
    };
  } else if (!practice && tracks[key]) tracks[key] = { ...applyGrade(tracks[key], toGrade(result), day, result), lastItem: card.exampleId ?? tracks[key].lastItem };
  const log: ReviewLog = {
    id: uid("l"),
    at: new Date().toISOString(),
    day,
    entryId: card.entryId,
    senseId: card.senseId,
    kind,
    result,
    correct: isCorrect(result),
    practice,
    plays: input.plays,
    exampleId: card.exampleId,
    audioFallback: input.audioFallback || undefined,
    chosen: input.chosen,
    retry: card.retry ? true : undefined,
    free: card.free || undefined,
  };
  return { ...state, tracks, logs: [...state.logs, log] };
}

/** 为听力 / 新句理解挑选复测句：轮换使用，新句理解尽量和听力用不同的句子 */
export function pickTestExample(sense: Sense, kind: TrackKind, reviews: number): string | undefined {
  const tests = testExamples(sense);
  if (!tests.length) return undefined;
  const offset = kind === "context" ? 1 : 0;
  return tests[(reviews + offset) % tests.length].id;
}

export function dueTracks(state: AppState, day: string): TrackState[] {
  const pos = new Map(state.order.map((id, i) => [id, i]));
  return Object.values(state.tracks)
    .filter((t) => t.due !== null && t.due <= day && findSense(state, t.entryId, t.senseId))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.due ?? "").localeCompare(b.due ?? "") ||
        (pos.get(a.entryId) ?? 0) - (pos.get(b.entryId) ?? 0),
    );
}

/** 可以初学的义项：有学习句、还没建立轨道。配好练习的词条排在前面 */
export function newCandidates(state: AppState): { entryId: string; senseId: string }[] {
  const learned = new Set(Object.values(state.tracks).map((t) => t.senseId));
  const out: { entryId: string; senseId: string; curated: boolean; i: number }[] = [];
  state.order.forEach((id, i) => {
    const e = state.entries[id];
    if (!e) return;
    for (const s of e.senses) {
      if (!learned.has(s.id) && senseReady(s).learn) out.push({ entryId: id, senseId: s.id, curated: e.curated, i });
    }
  });
  out.sort((a, b) => Number(b.curated) - Number(a.curated) || a.i - b.i);
  return out.map(({ entryId, senseId }) => ({ entryId, senseId }));
}

export function learnedToday(state: AppState, day: string): number {
  return state.logs.filter((l) => l.kind === "learn" && l.day === day).length;
}

export function newQuota(state: AppState, day: string): number {
  return Math.max(0, state.settings.newPerDay - learnedToday(state, day));
}

/**
 * 今日队列：先听力（避免先看到文字）、再新句理解、再文字回忆，最后是新学。
 * 新学：学习句卡 → 隔几张后主动回忆。
 */
export function buildQueue(state: AppState, day: string, opts: { includeNew?: boolean; quota?: number; exclude?: TrackKind[] } = {}): Card[] {
  const cards: Card[] = [];
  for (const t of dueTracks(state, day)) {
    if (opts.exclude?.includes(t.kind)) continue;
    const found = findSense(state, t.entryId, t.senseId)!;
    const exampleId =
      t.kind === "text"
        ? undefined
        : t.kind === "spelling"
          ? pickSpellingItem(state, t)?.id
          : t.kind === "part1"
            ? pickPart1Question(state, t)?.key
            : pickTestExample(found.sense, t.kind, t.reviews);
    if (t.kind !== "text" && !exampleId) continue; // 复测句 / 拼写句被删掉了
    cards.push({ id: uid("c"), type: t.kind, entryId: t.entryId, senseId: t.senseId, exampleId });
  }
  if (opts.includeNew !== false) {
    const fresh = newCandidates(state).slice(0, opts.quota ?? newQuota(state, day));
    const recalls: Card[] = [];
    fresh.forEach((f, i) => {
      const found = findSense(state, f.entryId, f.senseId)!;
      cards.push({ id: uid("c"), type: "learn", ...f, exampleId: learnExample(found.sense)?.id });
      recalls.push({ id: uid("c"), type: "text", ...f, intro: true });
      if (i >= 2) cards.push(recalls.shift()!);
    });
    cards.push(...recalls);
  }
  return cards;
}

/**
 * 托业 Part 1 听音选图专项：先到期的复习题，再没做过的新题。
 * free = 自由练习，所有可判分的题都出，不计入排期和正确率。
 */
export function buildPart1Queue(state: AppState, day: string, opts: { free?: boolean } = {}): Card[] {
  const qs = part1Questions(state);
  if (opts.free) return qs.map((q) => ({ id: uid("c"), type: "part1", entryId: q.entryId, senseId: q.senseId, exampleId: q.key, free: true }));
  const cards: Card[] = [];
  for (const t of dueTracks(state, day)) {
    if (t.kind !== "part1") continue;
    const q = pickPart1Question(state, t);
    if (q) cards.push({ id: uid("c"), type: "part1", entryId: t.entryId, senseId: t.senseId, exampleId: q.key });
  }
  const started = new Set(Object.values(state.tracks).filter((t) => t.kind === "part1").map((t) => t.senseId));
  const taken = new Set<string>();
  for (const q of qs) {
    if (started.has(q.senseId) || taken.has(q.senseId)) continue;
    taken.add(q.senseId);
    cards.push({ id: uid("c"), type: "part1", entryId: q.entryId, senseId: q.senseId, exampleId: q.key });
  }
  return cards;
}

export function startSession(state: AppState, day: string): AppState {
  return { ...state, session: { day, queue: buildQueue(state, day), index: 0 } };
}

/** 答错 / 看字幕才懂 / 没想起来：隔几题再出现一次 */
export function advanceSession(session: Session, failed: boolean): Session {
  const card = session.queue[session.index];
  const queue = [...session.queue];
  if (failed && card && card.type !== "learn" && (card.retry ?? 0) < MAX_RETRY) {
    const at = Math.min(session.index + 1 + RETRY_GAP, queue.length);
    queue.splice(at, 0, { ...card, id: uid("c"), retry: (card.retry ?? 0) + 1 });
  }
  return { ...session, queue, index: session.index + 1 };
}

/** 统计：正式复习（不含本轮重做和初学当天回忆） */
export function computeStats(state: AppState, today: string) {
  const formal = state.logs.filter((l) => !l.practice);
  const by = (k: TrackKind) => formal.filter((l) => l.kind === k);
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
  const listening = by("listening");
  const context = by("context");
  const text = by("text");
  const spelling = by("spelling");
  const part1 = by("part1");
  const part1Retries = state.logs.filter((l) => l.kind === "part1" && l.practice && l.retry);
  const count = (arr: ReviewLog[], r: AnyResult) => arr.filter((l) => l.result === r).length;

  const trackCounts = Object.fromEntries(
    KIND_ORDER.map((k) => {
      const ts = Object.values(state.tracks).filter((t) => t.kind === k);
      const c = { due: 0, learning: 0, mastered: 0, total: ts.length };
      for (const t of ts) {
        const s = trackStatus(t, today);
        if (s !== "none") c[s]++;
      }
      return [k, c];
    }),
  ) as Record<TrackKind, { due: number; learning: number; mastered: number; total: number }>;

  const days: { day: string; learned: number; reviews: number; correct: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const ls = state.logs.filter((l) => l.day === d);
    const f = ls.filter((l) => !l.practice);
    days.push({ day: d, learned: ls.filter((l) => l.kind === "learn").length, reviews: f.length, correct: f.filter((l) => l.correct).length });
  }

  return {
    listening: {
      total: listening.length,
      first: count(listening, "first"),
      replay: count(listening, "replay"),
      subtitle: count(listening, "subtitle"),
      firstRate: rate(count(listening, "first"), listening.length),
    },
    context: { total: context.length, correct: count(context, "correct"), rate: rate(count(context, "correct"), context.length) },
    text: { total: text.length, correct: count(text, "good"), rate: rate(count(text, "good"), text.length) },
    part1: {
      total: part1.length,
      first: count(part1, "first"),
      replay: count(part1, "replay"),
      wrong: count(part1, "wrong"),
      firstRate: rate(count(part1, "first"), part1.length),
      retries: part1Retries.length,
      retryCorrect: part1Retries.filter((l) => l.correct).length,
    },
    spelling: { total: spelling.length, correct: count(spelling, "correct"), rate: rate(count(spelling, "correct"), spelling.length) },
    passages: (() => {
      const a = state.passageAttempts ?? [];
      const score = a.reduce((n, x) => n + x.score, 0);
      const total = a.reduce((n, x) => n + x.total, 0);
      return { attempts: a.length, score, total, rate: rate(score, total) };
    })(),
    learnedSenses: new Set(Object.values(state.tracks).map((t) => t.senseId)).size,
    trackCounts,
    days,
  };
}
