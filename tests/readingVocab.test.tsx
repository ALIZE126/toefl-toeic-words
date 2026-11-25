import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 60000 });
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { READING_PATH, importedState } from "./helpers";
import { TIERS, applyReadingImport, parseReadingVocab, planReadingImport, readingGloss } from "../src/lib/readingVocab";
import { buildQueue, introduce, newCandidates, recordAnswer } from "../src/lib/scheduler";
import { learnExample } from "../src/lib/library";
import { loadState, saveState, STORAGE_KEY } from "../src/lib/storage";
import { loadStateAsync, resetStateDbForTests, saveStateAsync } from "../src/lib/stateDb";
import App from "../src/App";
import { goTab, openImport } from "./ui";

const has = existsSync(READING_PATH);
const raw = () => readFileSync(READING_PATH, "utf8");

beforeEach(async () => {
  localStorage.clear();
  resetStateDbForTests();
  await new Promise<void>((r) => {
    const q = indexedDB.deleteDatabase("toefl-toeic-words-state");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
});
afterEach(() => cleanup());

describe.runIf(has)("托福阅读词汇册导入", () => {
  it("读取 2333 条；分层 239 / 720 / 1374", () => {
    const pack = parseReadingVocab(raw(), "阅读词汇数据.json");
    expect(pack.items).toHaveLength(2333);
    expect(pack.materials).toBe(229);
    const by = Object.fromEntries(TIERS.map((t) => [t, pack.items.filter((x) => x.priority === t).length]));
    expect(by).toEqual({ 先背: 239, 进阶: 720, 话题识别: 1374 });
  });

  it("精简词典参考义；整理释义原样", () => {
    expect(readingGloss({ meaning: "v. 表明；暗示；指出", gloss_type: "整理释义" })).toEqual({ pos: "v.", gloss: "表明；暗示；指出" });
    expect(readingGloss({ meaning: "a. 神圣的, 献给上帝的, 庄严的, 祭祀的", gloss_type: "词典参考义" })).toEqual({ pos: "adj.", gloss: "神圣的；献给上帝的" });
    expect(readingGloss({ meaning: "n. 保卫, 保护措施, 防护设施；vt. 保卫, 保护", gloss_type: "词典参考义" })).toEqual({ pos: "", gloss: "n.保卫；保护措施；vt.保卫；保护" });
  });

  it("导入到托福词库：新词按分层排序、带原题例句；已有的词复用义项并补例句，进度不变", async () => {
    let s = await importedState();
    s = introduce(s, "colony", "colony#group", "2026-11-20");
    s = recordAnswer(s, { card: { id: "c1", type: "text", entryId: "colony", senseId: "colony#group" }, result: "good", day: "2026-11-21" });
    const before = structuredClone(s);
    const pack = parseReadingVocab(raw(), "阅读词汇数据.json");
    const plan = planReadingImport(s, pack, [...TIERS]);
    expect(plan.create.length + plan.reuse.length).toBe(2333);
    expect(plan.reuse.length).toBe(155);
    const { state, report } = applyReadingImport(s, pack, plan, "2026-11-25T08:00:00.000Z");
    expect(report).toMatchObject({ added: plan.create.length, reused: 155 });
    expect(state.order).toHaveLength(258 + plan.create.length);

    const indicate = state.entries["indicate"];
    expect(indicate).toMatchObject({ word: "indicate", meaning: "v. 表明；暗示；指出", phonetic: "/'indikeit/", decks: ["toefl"] });
    expect(indicate.reading).toMatchObject({ tier: "先背", count: 48, materials: 229, kind: "word" });
    const ex = learnExample(indicate.senses[0])!;
    expect(ex).toMatchObject({ kind: "original", role: "learn" });
    expect(ex.source).toContain("Prehistoric Kinship Structures");
    expect(state.entries["lead to"].reading?.kind).toBe("phrase");

    // 新词顺序：先背在前，同层按出现篇数
    const rvOrder = state.order.filter((id) => state.entries[id].reading && !before.entries[id]);
    const tiers = rvOrder.map((id) => state.entries[id].reading!.tier);
    expect(tiers.indexOf("进阶")).toBeGreaterThan(tiers.lastIndexOf("先背"));
    expect(tiers.indexOf("话题识别")).toBeGreaterThan(tiers.lastIndexOf("进阶"));

    // 已有的 colony：同一个词条，进度不变；原题例句补成复测句（之前已有学习句）
    expect(state.tracks).toEqual(before.tracks);
    expect(state.entries["colony"].reading).toBeTruthy();
    const colony = state.entries["colony"].senses;
    expect(colony.map((x) => x.id)).toEqual(before.entries["colony"].senses.map((x) => x.id));
    const added = colony.flatMap((x) => x.examples).filter((e) => e.id.includes("/rv-"));
    expect(added).toHaveLength(1);
    // 原来的内容没被改
    expect(state.entries["colony"].meaning).toBe(before.entries["colony"].meaning);

    // 重复导入：没有变化
    const again = applyReadingImport(state, pack, planReadingImport(state, pack, [...TIERS]));
    expect(again.report).toMatchObject({ added: 0, already: plan.create.length + 155, reused: 0 });
    expect(again.state.order).toEqual(state.order);
  });

  it("每天新学 200 个：先背的词先出，200 个义项产生 400 步", async () => {
    const s0 = await importedState();
    const pack = parseReadingVocab(raw(), "阅读词汇数据.json");
    let { state } = applyReadingImport(s0, pack, planReadingImport(s0, pack, [...TIERS]));
    state = { ...state, settings: { ...state.settings, newPerDay: 200 } };
    const cand = newCandidates(state);
    // 前 30 个是内置练习词，之后是先背
    const firstReading = cand.find((c) => state.entries[c.entryId].reading && !state.entries[c.entryId].curated)!;
    expect(state.entries[firstReading.entryId].reading!.tier).toBe("先背");
    const q = buildQueue(state, "2026-11-25");
    expect(q.filter((c) => c.type === "learn")).toHaveLength(200);
    expect(q).toHaveLength(400);
  });

  it("界面：词库 → 导入 → 托福阅读词汇册，可以只选分层；导入后按分层筛选", async () => {
    saveState(await importedState());
    render(<App />);
    goTab("词库");
    openImport("托福阅读词汇册");
    const file = new File([raw()], "阅读词汇数据.json", { type: "application/json" });
    fireEvent.change(screen.getByTestId("reading-json-input"), { target: { files: [file] } });
    const preview = await screen.findByTestId("reading-preview");
    expect(preview.textContent).toContain("共 2333 条（来自 229 篇）");
    fireEvent.click(screen.getByLabelText(/话题识别/));
    expect(preview.textContent).toMatch(/将新增 \d+ 个词条/);
    fireEvent.click(screen.getByRole("button", { name: "确认导入到托福词库" }));
    expect((await screen.findByTestId("reading-report")).textContent).toContain("新增");
    const saved = loadState();
    const rv = Object.values(saved.entries).filter((e) => e.reading);
    expect(rv.every((e) => e.reading!.tier !== "话题识别")).toBe(true);
    expect(rv.length).toBe(239 + 720);
    fireEvent.click(screen.getByRole("button", { name: "收起导入面板" }));
    fireEvent.click(screen.getByRole("button", { name: "先背 (239)" }));
    expect(document.querySelectorAll(".word-row").length).toBe(120);
  });
});

describe("主存储换成 IndexedDB", () => {
  it("保存到 IndexedDB 并读回；localStorage 放不下时只存 IndexedDB，并删掉过期的 localStorage 副本", async () => {
    const s = await importedState();
    expect(await saveStateAsync(s)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    resetStateDbForTests();
    expect((await loadStateAsync()).order).toHaveLength(258);

    // 模拟 localStorage 满了
    const big = { ...s, logs: Array.from({ length: 30000 }, (_, i) => ({ ...(s.logs[0] ?? {}), id: `l${i}`, at: "", day: "2026-11-25", entryId: "colony", senseId: "colony#group", kind: "text" as const, result: "good" as const, correct: true, practice: false })) };
    const setItem = Storage.prototype.setItem;
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === STORAGE_KEY && v.length > 2_000_000) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
      return setItem.call(this, k, v);
    });
    expect(await saveStateAsync(big)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    spy.mockRestore();
    resetStateDbForTests();
    expect((await loadStateAsync()).logs).toHaveLength(30000);
  });

  it("从旧版本升级：只有 localStorage 里有数据时照常读出", async () => {
    saveState(await importedState());
    expect((await loadStateAsync()).order).toHaveLength(258);
  });
});
