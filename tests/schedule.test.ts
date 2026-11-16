import { describe, expect, it } from "vitest";
import { importedState } from "./helpers";
import {
  advanceSession,
  buildQueue,
  computeStats,
  dueTracks,
  introduce,
  recordAnswer,
  trackKey,
  trackStatus,
} from "../src/lib/scheduler";
import type { AnyResult, AppState, Card, TrackKind } from "../src/types";

const D0 = "2026-11-16";
const day = (n: number) => `2026-11-${String(16 + n).padStart(2, "0")}`;
const SID = "approach#method";

function answer(state: AppState, kind: TrackKind, result: AnyResult, d: string): AppState {
  const card: Card = { id: `c-${kind}-${d}`, type: kind, entryId: "approach", senseId: SID, exampleId: "approach#method/test1" };
  return recordAnswer(state, { card, result, day: d });
}

describe("排期：文字和听力分开", () => {
  it("初学后第 1、3、7 天复习，第 7 天通过即掌握", async () => {
    let s = introduce(await importedState(), "approach", SID, D0);
    for (const k of ["listening", "context", "text"] as const) expect(s.tracks[trackKey(SID, k)].due).toBe(day(1));
    s = answer(s, "text", "good", day(1));
    expect(s.tracks[trackKey(SID, "text")].due).toBe(day(3));
    s = answer(s, "text", "good", day(3));
    expect(s.tracks[trackKey(SID, "text")].due).toBe(day(7));
    s = answer(s, "text", "good", day(7));
    expect(trackStatus(s.tracks[trackKey(SID, "text")], day(7))).toBe("mastered");
  });

  it("同一义项可以「文字已掌握、听力待复习」", async () => {
    let s = introduce(await importedState(), "approach", SID, D0);
    // 文字：第 1、3、7 天都想起来了
    s = answer(s, "text", "good", day(1));
    s = answer(s, "text", "good", day(3));
    s = answer(s, "text", "good", day(7));
    // 听力：第 1 天看字幕才懂 → 次日；第 2 天重听才懂 → 不升级，次日；第 3 天首听听懂 → 第 5 天
    s = answer(s, "listening", "subtitle", day(1));
    expect(s.tracks[trackKey(SID, "listening")]).toMatchObject({ stage: 0, due: day(2), lapses: 1 });
    s = answer(s, "listening", "replay", day(2));
    expect(s.tracks[trackKey(SID, "listening")]).toMatchObject({ stage: 0, due: day(3) });
    s = answer(s, "listening", "first", day(3));
    expect(s.tracks[trackKey(SID, "listening")]).toMatchObject({ stage: 1, due: day(5) });
    s = answer(s, "listening", "subtitle", day(5));

    const text = s.tracks[trackKey(SID, "text")];
    const listening = s.tracks[trackKey(SID, "listening")];
    expect(trackStatus(text, day(6))).toBe("mastered");
    expect(trackStatus(listening, day(6))).toBe("due");
    expect(listening.due).toBe(day(6));

    // 第 6 天的队列里只有听力（和尚未做的新句理解），没有文字题
    const due = dueTracks(s, day(6)).filter((t) => t.senseId === SID).map((t) => t.kind);
    expect(due).toContain("listening");
    expect(due).not.toContain("text");

    const stats = computeStats(s, day(6));
    expect(stats.listening).toMatchObject({ total: 4, first: 1, replay: 1, subtitle: 2, firstRate: 25 });
    expect(stats.trackCounts.text.mastered).toBe(1);
    expect(stats.trackCounts.listening.due).toBe(1);
  });

  it("答错 / 看字幕才懂的题隔几题再出现，本轮重做不改排期", async () => {
    let s = await importedState();
    for (const [e, id] of [
      ["postpone", "postpone#delay"],
      ["seminar", "seminar#meeting"],
      ["glacier", "glacier#ice"],
      ["erosion", "erosion#wear"],
    ])
      s = introduce(s, e, id, D0);
    const queue = buildQueue(s, day(1), { includeNew: false });
    // 先听力，再新句理解，再文字
    expect(queue.map((c) => c.type)).toEqual([...Array(4).fill("listening"), ...Array(4).fill("context"), ...Array(4).fill("text")]);

    let session = { day: day(1), queue, index: 0 };
    const first = queue[0];
    s = recordAnswer(s, { card: first, result: "subtitle", day: day(1) });
    session = advanceSession(session, true);
    expect(session.queue).toHaveLength(13);
    const retry = session.queue[4];
    expect(retry).toMatchObject({ type: "listening", senseId: first.senseId, retry: 1 });
    expect(s.tracks[trackKey(first.senseId, "listening")].due).toBe(day(2));

    const before = s.tracks[trackKey(first.senseId, "listening")];
    s = recordAnswer(s, { card: retry, result: "first", day: day(1) });
    expect(s.tracks[trackKey(first.senseId, "listening")]).toEqual(before);
    expect(s.logs.at(-1)).toMatchObject({ practice: true });
  });

  it("新学：学习句卡之后隔几张再做主动回忆，配好练习的词优先", async () => {
    const s = await importedState();
    const q = buildQueue(s, D0);
    expect(q.filter((c) => c.type === "learn")).toHaveLength(10);
    expect(q.filter((c) => c.intro)).toHaveLength(10);
    expect(q.slice(0, 4).map((c) => c.type)).toEqual(["learn", "learn", "learn", "text"]);
    expect(q[3].senseId).toBe(q[0].senseId);
    expect(q.filter((c) => c.type === "learn").every((c) => s.entries[c.entryId].curated)).toBe(true);
  });
});
