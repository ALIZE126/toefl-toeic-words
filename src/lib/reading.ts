import type { AppState, Entry, PassageAttempt, ReviewLog, Sense, TrackState } from "../types";
import type { Passage, PassageTarget } from "../data/passages";
import { buildCloze, isBlankCorrect, type Blank, type Cloze } from "./cloze";
import { applyGrade, trackKey } from "./scheduler";
import { passageSentenceId } from "./spelling";
import { uid } from "./util";

export interface PreparedPassage {
  passage: Passage;
  cloze: Cloze;
  /** 每一空对应的生词本目标（普通词为 undefined） */
  targets: (PassageTarget | undefined)[];
}

export function preparePassage(passage: Passage): PreparedPassage {
  const cloze = buildCloze(passage.text);
  const targets = cloze.blanks.map((b) => passage.targets.find((t) => t.form === b.word.toLowerCase()));
  return { passage, cloze, targets };
}

export interface BlankResult {
  blank: Blank;
  input: string;
  correct: boolean;
  target?: PassageTarget;
}

export function gradePassage(prep: PreparedPassage, inputs: string[]): BlankResult[] {
  return prep.cloze.blanks.map((blank, i) => ({
    blank,
    input: inputs[i] ?? "",
    correct: isBlankCorrect(blank, inputs[i] ?? ""),
    target: prep.targets[i],
  }));
}

/** 目标词在当前词库里对应的词条和义项（义项被改过时退回第一个义项） */
export function resolveTarget(state: AppState, t: PassageTarget): { entry: Entry; sense: Sense } | undefined {
  const entry = state.entries[t.entryId];
  if (!entry || !entry.senses.length) return undefined;
  return { entry, sense: entry.senses.find((s) => s.id === t.senseId) ?? entry.senses[0] };
}

/**
 * 记录整篇作答：
 * - 10 空（目标词 + 普通词）都计入这篇短文的成绩；
 * - 生词本目标词另记一条拼写日志；拼错的加入拼写复习（次日复习，下次换一句考）。
 *   拼对且已有拼写轨道时不改排期，由「今日复习」里的拼写题推进。
 * 文字回忆、听力等其他轨道不受影响。
 */
export function recordPassage(
  state: AppState,
  passage: Passage,
  results: BlankResult[],
  day: string,
  now = new Date().toISOString(),
): { state: AppState; attempt: PassageAttempt } {
  const tracks = { ...state.tracks };
  const logs: ReviewLog[] = [];
  for (const r of results) {
    if (!r.target) continue;
    const found = resolveTarget(state, r.target);
    if (!found) continue;
    const { entry, sense } = found;
    const item = passageSentenceId(passage.id, r.target.form);
    logs.push({
      id: uid("l"),
      at: now,
      day,
      entryId: entry.id,
      senseId: sense.id,
      kind: "spelling",
      result: r.correct ? "correct" : "wrong",
      correct: r.correct,
      practice: false,
      exampleId: item,
      passageId: passage.id,
    });
    if (!r.correct) {
      const key = trackKey(sense.id, "spelling");
      const base: TrackState = tracks[key] ?? {
        senseId: sense.id,
        entryId: entry.id,
        kind: "spelling",
        stage: 0,
        due: day,
        introducedOn: day,
        reviews: 0,
        lapses: 0,
      };
      tracks[key] = { ...applyGrade(base, "fail", day, "wrong"), lastItem: item };
    }
  }
  const targetResults = results.filter((r) => r.target);
  const attempt: PassageAttempt = {
    id: uid("p"),
    passageId: passage.id,
    at: now,
    day,
    score: results.filter((r) => r.correct).length,
    total: results.length,
    targetCorrect: targetResults.filter((r) => r.correct).length,
    targetTotal: targetResults.length,
    answers: results.map((r) => ({ input: r.input, correct: r.correct })),
  };
  return {
    state: { ...state, tracks, logs: [...state.logs, ...logs], passageAttempts: [...(state.passageAttempts ?? []), attempt] },
    attempt,
  };
}

export function passageSummary(state: AppState, passageId: string) {
  const list = (state.passageAttempts ?? []).filter((a) => a.passageId === passageId);
  if (!list.length) return null;
  return { attempts: list.length, last: list[list.length - 1], best: Math.max(...list.map((a) => a.score)) };
}
