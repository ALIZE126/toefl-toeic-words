import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 90000 });
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { importedState, packZip } from "./helpers";
import { applyPart1Import, part1Questions, planPart1Import, readPart1Pack, storePackImages } from "../src/lib/part1";
import { acquireImageUrl, listImageKeys, putImages, resetImageStoreForTests } from "../src/lib/imageStore";
import { buildPart1Queue, buildQueue, introduce, recordAnswer, trackKey } from "../src/lib/scheduler";
import { SCHEMA, SNAPSHOT_KEY, STORAGE_KEY, loadState, migrate, parseBackup, exportBackup, saveState } from "../src/lib/storage";
import type { AppState } from "../src/types";
import App from "../src/App";
import { goTab } from "./ui";

beforeEach(async () => {
  localStorage.clear();
  resetImageStoreForTests();
  await new Promise<void>((r) => {
    const q = indexedDB.deleteDatabase("toefl-toeic-words-images");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
});
afterEach(() => cleanup());

function mockSpeech() {
  class U {
    onstart?: () => void;
    voice?: unknown;
    lang = "";
    rate = 1;
    constructor(public text: string) {}
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true, writable: true });
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = U;
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => [{ lang: "en-US", name: "S", voiceURI: "s" }],
      speak: (u: U) => setTimeout(() => u.onstart?.(), 0),
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
}

async function withPack(): Promise<AppState> {
  const base = await importedState();
  const pack = await readPart1Pack(packZip(), "pack.zip");
  const keys = await listImageKeys();
  const stored = await storePackImages(pack, new Set(keys), putImages);
  return applyPart1Import(base, pack, planPart1Import(base, pack, keys), stored.refs).state;
}

describe("四入口导航与首页", () => {
  it("今日 / 专项 / 词库 / 记录：底部和顶部导航同名；设置在今日、导入在词库、备份在记录", async () => {
    saveState(await importedState());
    render(<App />);
    const bottom = screen.getByRole("navigation", { name: "底部导航" });
    const top = screen.getByRole("navigation", { name: "主要导航" });
    for (const nav of [bottom, top]) expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["今日", "专项", "词库", "记录"]);
    expect(within(bottom).getByRole("button", { name: "今日" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("学习设置")).toBeTruthy();
    goTab("专项");
    expect(screen.getByText("托业 Part 1")).toBeTruthy();
    expect(screen.getByText("补全单词")).toBeTruthy();
    goTab("词库");
    expect(screen.getByRole("button", { name: "导入" })).toBeTruthy();
    expect(screen.getByLabelText("搜索词条")).toBeTruthy();
    goTab("记录");
    expect(screen.getByText("数据管理")).toBeTruthy();
    expect(screen.getAllByText("尚无记录").length).toBeGreaterThan(0);
  });

  it("首页分别计数待复习、新学义项和实际步骤，并说明含稍后回忆", async () => {
    let s = await importedState();
    s = introduce(s, "glacier", "glacier#ice", "2020-01-01");
    s = { ...s, settings: { ...s.settings, newPerDay: 13 } };
    saveState(s);
    render(<App />);
    const hero = screen.getByTestId("today-hero");
    const counts = Array.from(hero.querySelectorAll(".hero-counts .count")).map((x) => x.textContent);
    const steps = buildQueue(s, new Date().toISOString().slice(0, 10), { quota: 13 }).length;
    expect(counts).toEqual(["3", "13", String(steps)]);
    expect(hero.textContent).toContain("13 个新义项产生 26 步（含稍后回忆）");
    expect(hero.textContent).toContain("开始今日学习");
  });
});

describe("继续学习：恢复当前题和作答阶段", () => {
  it("新学卡显示释义后退出、刷新：首页显示继续学习和进度，回来仍是已显示释义的阶段", async () => {
    saveState(await importedState());
    const v = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /开始今日学习/ }));
    expect(screen.queryByRole("navigation", { name: "底部导航" })).toBeNull(); // 专注页
    fireEvent.click(screen.getByRole("button", { name: "显示释义" }));
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.click(screen.getByRole("button", { name: "显示释义" }));
    const gloss = document.querySelector(".answer h3")!.textContent;
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    // 回到原入口（今日）
    expect(screen.getByRole("navigation", { name: "底部导航" })).toBeTruthy();
    v.unmount(); // 相当于刷新页面
    render(<App />);
    const hero = screen.getByTestId("today-hero");
    expect(hero.textContent).toContain("继续学习");
    expect(hero.querySelector(".count")!.textContent).toBe("2/ 20 张");
    expect(hero.textContent).toContain("已作答到一半，会回到原来的阶段");
    fireEvent.click(within(hero).getByRole("button", { name: /继续学习/ }));
    expect(document.querySelector(".answer h3")!.textContent).toBe(gloss);
    expect(screen.getByRole("button", { name: "继续" })).toBeTruthy();
  });

  it("Part 1 听音选图：图片顺序、听过的次数和所选图片在刷新后不变", async () => {
    mockSpeech();
    const s = await withPack();
    saveState({ ...s, settings: { ...s.settings, deck: "toeic" } });
    const v = render(<App />);
    goTab("专项");
    fireEvent.click(screen.getByRole("button", { name: "进入托业 Part 1" }));
    fireEvent.click(screen.getByText("开始听音选图（2 题）"));
    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    await waitFor(() => expect(screen.getByTestId("part1-card").textContent).toContain("已听 1 次"));
    await waitFor(() => expect(screen.getByTestId("part1-card").querySelectorAll("img")).toHaveLength(2));
    const before = Array.from(screen.getByTestId("part1-card").querySelectorAll("img")).map((i) => i.getAttribute("data-asset"));
    fireEvent.click(screen.getAllByRole("radio")[1]);
    v.unmount();
    for (let k = 0; k < 5; k++) {
      const r = render(<App />);
      goTab("今日");
      fireEvent.click(within(screen.getByTestId("today-hero")).getByRole("button", { name: /继续学习/ }));
      await waitFor(() => expect(screen.getByTestId("part1-card").querySelectorAll("img")).toHaveLength(2));
      expect(Array.from(screen.getByTestId("part1-card").querySelectorAll("img")).map((i) => i.getAttribute("data-asset"))).toEqual(before);
      expect(screen.getByTestId("part1-card").textContent).toContain("已听 1 次");
      expect(screen.getAllByRole("radio")[1].getAttribute("aria-checked")).toBe("true");
      r.unmount();
    }
  });
});

describe("每次正式作答只提交一次", () => {
  it("同一张卡重复提交（连续点击、刷新后重放）只记一次，排期只推进一次", async () => {
    let s = introduce(await importedState(), "glacier", "glacier#ice", "2026-11-16");
    const card = { id: "card-x", type: "text" as const, entryId: "glacier", senseId: "glacier#ice" };
    s = recordAnswer(s, { card, result: "good", day: "2026-11-17" });
    const once = s;
    s = recordAnswer(s, { card, result: "good", day: "2026-11-17" });
    s = recordAnswer(s, { card, result: "again", day: "2026-11-17" });
    expect(s).toBe(once);
    expect(s.logs.filter((l) => l.kind === "text")).toHaveLength(1);
    expect(s.tracks[trackKey("glacier#ice", "text")]).toMatchObject({ stage: 1, reviews: 1 });
  });

  it("界面上连点两次「想起来了」只前进一张、记一条", async () => {
    let s = introduce(await importedState(), "glacier", "glacier#ice", "2020-01-01");
    s = { ...s, settings: { ...s.settings, newPerDay: 0 } };
    saveState(s);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /开始今日学习/ }));
    while (!screen.queryByRole("button", { name: "显示答案" })) {
      // 跳到文字回忆卡（前面是听力 / 新句理解）
      const st = loadState();
      saveState({ ...st, session: { ...st.session!, index: st.session!.index + 1 } });
      cleanup();
      render(<App />);
      fireEvent.click(within(screen.getByTestId("today-hero")).getByRole("button", { name: /继续学习/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: "显示答案" }));
    const good = screen.getByRole("button", { name: "想起来了" });
    fireEvent.click(good);
    fireEvent.click(good);
    const saved = loadState();
    expect(saved.logs.filter((l) => l.kind === "text")).toHaveLength(1);
  });
});

describe("存储迁移与备份", () => {
  it("旧数据（schema 1）打开时迁移：保留副本、补 decks / 会话字段，重复迁移不变", async () => {
    const s = await importedState();
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    delete old.schema;
    delete old.readingDrafts;
    for (const e of Object.values(old.entries as Record<string, Record<string, unknown>>)) delete e.decks;
    old.session = { day: "2026-11-16", queue: buildQueue(s, "2026-11-16"), index: 3 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    const loaded = loadState();
    expect(loaded.schema).toBe(SCHEMA);
    expect(Object.values(loaded.entries).every((e) => e.decks.join() === "toefl")).toBe(true);
    expect(loaded.session).toMatchObject({ scope: "daily", deck: "all", index: 3 });
    const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY)!);
    expect(snap.reason).toBe("migrate 1→2");
    expect(snap.state.session.index).toBe(3);
    expect(migrate(loaded)).toBe(loaded);
    expect(migrate(migrate(loaded))).toEqual(loaded);
  });

  it("导出的 JSON 备份可以恢复；旧格式备份（没有 schema、decks）也能恢复", async () => {
    let s = introduce(await importedState(), "glacier", "glacier#ice", "2026-11-16");
    s = recordAnswer(s, { card: { id: "b1", type: "text", entryId: "glacier", senseId: "glacier#ice" }, result: "good", day: "2026-11-17" });
    const restored = parseBackup(exportBackup(s));
    const tracks = JSON.parse(JSON.stringify(s.tracks));
    expect(restored.tracks).toEqual(tracks);
    const legacy = JSON.parse(exportBackup(s));
    delete legacy.schema;
    for (const e of Object.values(legacy.entries as Record<string, Record<string, unknown>>)) delete e.decks;
    expect(parseBackup(JSON.stringify(legacy))).toMatchObject({ schema: SCHEMA, tracks });
  });
});

describe("图片资源", () => {
  it("图片 URL 按使用者计数，最后一个使用者释放后延迟回收", async () => {
    const s = await withPack();
    const sha = part1Questions(s)[0].options[0].image.sha256;
    const a = await acquireImageUrl(sha);
    const b = await acquireImageUrl(sha);
    expect(a.url).toMatch(/^blob:/);
    expect(b.url).toBe(a.url);
    a.release();
    a.release(); // 重复释放无影响
    b.release();
    expect((await acquireImageUrl("no-such-image")).url).toBeNull();
  });

  it("看图学习可以放大图片，关闭后焦点回到原图；进度保存在 part1Study", async () => {
    mockSpeech();
    const s = await withPack();
    saveState(s);
    render(<App />);
    goTab("专项");
    fireEvent.click(screen.getByRole("button", { name: "进入托业 Part 1" }));
    fireEvent.click(screen.getByRole("button", { name: "开始看图学习" }));
    const zoom = await screen.findByRole("button", { name: /放大查看/ });
    fireEvent.click(zoom);
    expect(screen.getByRole("dialog", { name: "放大的图片" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /放大查看/ })));
    fireEvent.click(screen.getByRole("button", { name: "查看释义" }));
    fireEvent.click(screen.getByRole("button", { name: "继续学习" }));
    expect(loadState().part1Study).toEqual({ index: 1 });
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByRole("button", { name: "继续看图学习" })).toBeTruthy();
    expect(document.body.textContent).toContain("上次看到第 2 张");
  });

  it("听音选图所需图片不在本机时不能作答，可以跳过，这道题保持待练", async () => {
    mockSpeech();
    const s = await withPack();
    saveState({ ...s, settings: { ...s.settings, deck: "toeic" } });
    resetImageStoreForTests();
    await new Promise<void>((r) => {
      const q = indexedDB.deleteDatabase("toefl-toeic-words-images");
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "进入 Part 1 专项" }));
    fireEvent.click(screen.getByText("开始听音选图（2 题）"));
    expect((await screen.findByRole("alert")).textContent).toContain("2 张图片不在这台设备的浏览器里");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "重新关联图片包" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "跳过，稍后再练" }));
    const saved = loadState();
    expect(saved.logs.filter((l) => l.kind === "part1")).toHaveLength(0);
    expect(buildPart1Queue(saved, "2026-11-17")).toHaveLength(2);
  });
});

describe("托福补词", () => {
  it("上一空 / 下一空、未提交的输入保留；提交时提示剩余空数，再点一次才提交", async () => {
    saveState(await importedState());
    const v = render(<App />);
    goTab("专项");
    fireEvent.click(screen.getByRole("button", { name: "开始补词" }));
    fireEvent.click(screen.getByText("第 1 篇 · 地球科学"));
    const boxes = () => screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.focus(boxes()[0]);
    fireEvent.click(screen.getByRole("button", { name: "下一空" }));
    expect(document.activeElement).toBe(boxes()[1]);
    fireEvent.click(screen.getByRole("button", { name: "上一空" }));
    expect(document.activeElement).toBe(boxes()[0]);
    fireEvent.change(boxes()[2], { target: { value: "ved" } });
    v.unmount();
    render(<App />);
    goTab("专项");
    expect(screen.getByRole("button", { name: "继续：第 1 篇 · 地球科学" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续：第 1 篇 · 地球科学" }));
    expect(boxes()[2].value).toBe("ved");
    fireEvent.click(screen.getByRole("button", { name: "提交整篇 · 剩 9 空" }));
    expect(screen.getByRole("alert").textContent).toContain("还有 9 空没填");
    expect(loadState().passageAttempts).toHaveLength(0);
    const confirm = screen.getByRole("button", { name: "确认提交（9 空未填）" });
    fireEvent.click(confirm);
    fireEvent.click(screen.queryByRole("button", { name: /确认提交/ }) ?? document.body);
    const saved = loadState();
    expect(saved.passageAttempts).toHaveLength(1);
    expect(saved.passageAttempts[0]).toMatchObject({ score: 1, total: 10 });
    expect(saved.readingDrafts?.["p1-landforms"]).toBeUndefined();
    expect(screen.getByTestId("feedback").textContent).toContain("你的输入：ved");
  });
});
