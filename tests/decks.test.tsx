import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { importedState, loadFixtureRows } from "./helpers";
import { importRows, updateEntry } from "../src/lib/library";
import { deckCount, migrateDecks, scopeState } from "../src/lib/decks";
import { buildQueue, computeStats, introduce, newQuota, recordAnswer, trackKey } from "../src/lib/scheduler";
import { STORAGE_KEY, loadState, saveState } from "../src/lib/storage";
import type { AppState } from "../src/types";
import App from "../src/App";

afterEach(() => cleanup());

/** 一份托业生词本：5 个新词 + 3 个和托福词本重复的词 */
const TOEIC_ROWS = [
  { word: "invoice", meaning: "n.发票" },
  { word: "reimburse", meaning: "v.报销" },
  { word: "itinerary", meaning: "n.行程" },
  { word: "warehouse", meaning: "n.仓库" },
  { word: "Postpone", meaning: "v.推迟（托业词本里的释义）" },
  { word: "seminar", meaning: "n.研讨会" },
  { word: "policy", meaning: "n.政策" },
  { word: "quarterly", meaning: "adj.季度的" },
].map((r, i) => ({ row: i + 1, phonetic: "", ...r }));

async function twoDecks() {
  let s = await importedState(); // 附件导入到托福词库
  s = introduce(s, "postpone", "postpone#delay", "2026-11-16");
  s = recordAnswer(s, { card: { id: "a", type: "text", entryId: "postpone", senseId: "postpone#delay" }, result: "good", day: "2026-11-17" });
  const before = structuredClone(s);
  const r = importRows(s, TOEIC_ROWS, "托业生词.docx", "2026-12-01T08:00:00.000Z", { mode: "addOnly", deck: "toeic" });
  return { before, ...r };
}

describe("分词库：导入时选择词库", () => {
  it("附件导入到托福词库；托业词本只新增没有的词，重复的词同时属于两个词库", async () => {
    const { before, state, report } = await twoDecks();
    expect(Object.values(before.entries).every((e) => e.decks.join() === "toefl")).toBe(true);

    expect(report).toMatchObject({ deck: "toeic", added: 5, skippedExisting: 3, deckAdded: 3 });
    expect(report.addedWords).toEqual(["invoice", "reimburse", "itinerary", "warehouse", "quarterly"]);
    expect(report.deckAddedWords).toEqual(["Postpone", "seminar", "policy"]);
    expect(state.entries["invoice"].decks).toEqual(["toeic"]);
    expect(state.entries["postpone"].decks).toEqual(["toefl", "toeic"]);

    expect(deckCount(state, "all")).toBe(263);
    expect(deckCount(state, "toefl")).toBe(258);
    expect(deckCount(state, "toeic")).toBe(8);

    // 只改了词库归属：原始释义、义项、复习进度都不变，进度在两个词库共享
    expect({ ...state.entries["postpone"], decks: null }).toEqual({ ...before.entries["postpone"], decks: null });
    expect(state.entries["postpone"].meaning).toBe(before.entries["postpone"].meaning);
    expect(state.tracks).toEqual(before.tracks);
    for (const id of before.order.filter((x) => !["postpone", "seminar", "policy"].includes(x)))
      expect(state.entries[id]).toEqual(before.entries[id]);

    // 再导入一次同一份托业词本：什么都不变
    const again = importRows(state, TOEIC_ROWS, "托业生词.docx", undefined, { mode: "addOnly", deck: "toeic" });
    expect(again.report).toMatchObject({ added: 0, deckAdded: 0 });
    expect(again.state.entries).toEqual(state.entries);
  });

  it("今日复习和学习记录按词库筛选；新学额度所有词库合计", async () => {
    let { state } = await twoDecks();
    state = introduce(state, "glacier", "glacier#ice", "2026-11-16");
    const day = "2026-11-17";

    const toeic = scopeState(state, "toeic");
    const toefl = scopeState(state, "toefl");
    const ids = (s: AppState) => new Set(buildQueue(s, day, { includeNew: false }).map((c) => c.entryId));
    // glacier 只在托福；postpone 两个词库都有
    expect(ids(toeic)).toEqual(new Set(["postpone"]));
    expect(ids(toefl)).toEqual(new Set(["postpone", "glacier"]));
    expect(computeStats(toeic, day).learnedSenses).toBe(1);
    expect(computeStats(toefl, day).learnedSenses).toBe(2);

    // 托业里有义项的新词才会出现在托业的新学里
    const fresh = buildQueue(toeic, day, { quota: 10 }).filter((c) => c.type === "learn").map((c) => c.entryId);
    expect(fresh.every((id) => state.entries[id].decks.includes("toeic"))).toBe(true);
    expect(fresh).toEqual(expect.arrayContaining(["seminar", "policy"]));

    // 额度按全部词库算：今天在托福学了 2 个，托业剩 8 个
    let s2 = introduce(state, "erosion", "erosion#wear", day);
    s2 = introduce(s2, "habitat", "habitat#home", day);
    expect(newQuota(s2, day)).toBe(8);
  });

  it("旧数据（分词库之前）读取时归入托福词库", async () => {
    const s = await importedState();
    const legacy = { ...s, entries: Object.fromEntries(Object.entries(s.entries).map(([k, e]) => [k, { ...e, decks: undefined }])) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const loaded = loadState();
    expect(Object.values(loaded.entries).every((e) => e.decks.join() === "toefl")).toBe(true);
    expect(loaded.settings.deck).toBe("all");
    expect(migrateDecks(loaded)).toBe(loaded);
  });

  it("词条可以手动移到另一个词库，至少保留一个", async () => {
    const s = await importedState();
    const moved = updateEntry(s, "merchant", { decks: ["toeic"] });
    expect(deckCount(moved, "toeic")).toBe(1);
    expect(deckCount(moved, "toefl")).toBe(257);
  });
});

describe("分词库：界面", () => {
  beforeEach(() => localStorage.clear());

  it("顶部切换词库，词库列表和今日复习只显示该词库；词条详情可改所在词库", async () => {
    const { state } = await twoDecks();
    saveState(state);
    render(<App />);
    const bar = screen.getByRole("group", { name: "词库" });
    expect(within(bar).getByRole("button", { name: "全部 263" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "托福 258" })).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "托业 8" }));
    expect(document.body.textContent).toContain("今日复习 · ");
    expect(document.body.textContent).toContain("托业词库");

    fireEvent.click(screen.getByRole("button", { name: "词库" }));
    const words = Array.from(document.querySelectorAll(".word-row b")).map((b) => b.textContent);
    // 按词本原始顺序：policy (第 101 行)、seminar (214)、postpone (215)，然后是新增的托业词
    expect(words).toEqual(["policy", "seminar", "postpone", "invoice", "reimburse", "itinerary", "warehouse", "quarterly"]);
    // 当前在托业词库时，导入默认导入到托业
    expect((screen.getByLabelText("托业词库") as HTMLInputElement).checked).toBe(true);

    // 把 invoice 也加入托福
    fireEvent.click(screen.getByText("invoice"));
    const toefl = screen.getByRole("checkbox", { name: "托福" }) as HTMLInputElement;
    const toeic = screen.getByRole("checkbox", { name: "托业" }) as HTMLInputElement;
    expect([toefl.checked, toeic.checked]).toEqual([false, true]);
    expect(toeic.disabled).toBe(true); // 只剩一个词库时不能取消
    fireEvent.click(toefl);
    expect(loadState().entries["invoice"].decks).toEqual(["toeic", "toefl"]);
    expect(within(bar).getByRole("button", { name: "托福 259" })).toBeTruthy();
  });

  it("导入时选托业词库，新词进入托业", async () => {
    saveState(await importedState());
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "词库" }));
    fireEvent.click(screen.getByLabelText("托业词库"));
    const { rows } = await loadFixtureRows();
    expect(rows.length).toBe(258);
    // 用附件本身导入到托业：没有新词，258 个词同时加入托业
    const { readFileSync } = await import("node:fs");
    const { DOCX_PATH } = await import("./helpers");
    const buf = readFileSync(DOCX_PATH);
    const file = new File([buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer], "生词本.docx");
    fireEvent.change(screen.getByTestId("docx-input"), { target: { files: [file] } });
    const status = await screen.findByRole("status", {}, { timeout: 5000 });
    expect(status.textContent).toContain("增量导入「生词本.docx」到托业词库：读取 258 条，新增 0 个");
    expect(screen.getByTestId("deck-added").textContent).toContain("258 个已有的词同时加入了托业词库");
    const saved = loadState();
    expect(deckCount(saved, "toeic")).toBe(258);
    expect(saved.tracks[trackKey("postpone#delay", "text")]).toBeUndefined();
  });
});
