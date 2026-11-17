import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 90000, hookTimeout: 30000 });
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import JSZip from "jszip";
import { importedState, packZip } from "./helpers";
import {
  applyPart1Import,
  confusions,
  part1Index,
  part1Questions,
  planPart1Import,
  readPart1Pack,
  buildPart1Practice,
  practiceCount,
  resolveCardQuestion,
  storePackImages,
  type LoadedPack,
} from "../src/lib/part1";
import { getImageUrl, listImageKeys, putImages, resetImageStoreForTests } from "../src/lib/imageStore";
import { advanceSession, buildPart1Queue, buildQueue, computeStats, introduce, recordAnswer, trackKey, trackStatus } from "../src/lib/scheduler";
import { deckCount, scopeState } from "../src/lib/decks";
import { loadState, saveState } from "../src/lib/storage";
import { updateEntry } from "../src/lib/library";
import Part1Card from "../src/components/Part1Card";
import App from "../src/App";
import type { AppState, Session } from "../src/types";

const ZIP = "toeic-part1-image-pack.zip";

async function clearImages() {
  resetImageStoreForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("toefl-toeic-words-images");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

let cachedPack: Promise<LoadedPack> | null = null;
const realPack = () => (cachedPack ??= readPart1Pack(packZip(), ZIP));

/** 词本 258 条 + 导入图片包 */
async function withPack(base?: AppState, pack?: LoadedPack) {
  const p = pack ?? (await realPack());
  const state = base ?? (await importedState());
  const keys = await listImageKeys();
  const plan = planPart1Import(state, p, keys);
  const stored = await storePackImages(p, new Set(keys), putImages);
  const r = applyPart1Import(state, p, plan, stored.refs, "2026-11-17T08:00:00.000Z");
  return { pack: p, plan, stored, ...r };
}

beforeEach(async () => {
  await clearImages();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("读取图片包 ZIP", () => {
  it("240 条短语、240 张图片，无重复、无缺失；可判分题 1 组 2 题通过校验", async () => {
    const pack = await readPart1Pack(packZip(), ZIP);
    expect(pack.jsonPath).toBe("toeic-part1-image-pack/toeic-part1-phrases-with-images.json");
    expect(pack.phrases).toHaveLength(240);
    expect(pack.images.size).toBe(240);
    expect(pack.imageFilesInZip).toBe(240);
    expect(pack.missingImages).toEqual([]);
    expect(pack.duplicateIds).toEqual([]);
    expect(pack.duplicateNames).toEqual([]);
    expect(pack.groups).toHaveLength(1);
    expect(pack.groups[0]).toMatchObject({
      id: "part1-reach-hold-cup-study",
      phraseIds: ["p153", "p078"],
      eligible: true,
      reasons: [],
      questions: [
        { key: "part1-reach-hold-cup-study/q1", audioText: "The woman is reaching for a cup.", correctPhraseId: "p153" },
        { key: "part1-reach-hold-cup-study/q2", audioText: "The woman is holding a cup.", correctPhraseId: "p078" },
      ],
    });
    expect(pack.contrastGroups.find((g) => g.id === "g05")?.phraseIds).toEqual(["p153", "p154", "p078"]);
  });

  it("导入前预览：新增 239、复用已有的 examine 义项 1、待保存图片 240", async () => {
    const pack = await readPart1Pack(packZip(), ZIP);
    const plan = planPart1Import(await importedState(), pack, new Set());
    expect(plan.counts).toEqual({ phrases: 240, new: 239, reuseSense: 1, newSense: 0, already: 0 });
    expect(plan.images).toEqual({ inZip: 240, alreadyStored: 0, toStore: 240, missing: 0 });
    expect(plan.sameNameInLibrary).toEqual([{ phrase: "examine", entryId: "examine", senseGloss: "仔细检查；检查身体；审查" }]);
    expect(plan.groups).toEqual({ total: 1, eligible: 1, questions: 2, eligibleQuestions: 2 });
  });
});

describe("导入到托业词库", () => {
  it("240 条词、240 张图存入 IndexedDB；重新打开图片库后仍能读取", async () => {
    const before = await importedState();
    const { state, stored, report } = await withPack(before);
    expect(stored).toMatchObject({ stored: 240, already: 0, mismatched: [] });
    expect(report).toMatchObject({ phrases: 240, added: 239, reusedSense: 1, imagesMissing: 0, eligibleQuestions: 2 });

    const index = part1Index(state);
    expect(index.size).toBe(240);
    expect([...index.values()].every((v) => v.sense.part1?.image?.sha256)).toBe(true);
    expect(state.order).toHaveLength(258 + 239);
    expect(deckCount(state, "toeic")).toBe(240);
    expect(deckCount(state, "toefl")).toBe(258);

    // 新短语：原始内容、中文义项、出处、视觉线索
    const adjust = index.get("p001")!;
    expect(adjust.entry).toMatchObject({ id: "adjust", word: "adjust", meaning: "调整", decks: ["toeic"] });
    expect(adjust.sense.gloss).toBe("调整");
    expect(adjust.sense.part1).toMatchObject({ phraseId: "p001", categories: ["人物动作"] });
    expect(adjust.sense.part1!.sources).toHaveLength(5);
    expect(adjust.sense.part1!.sources[0]).toMatchObject({ sourceId: "6-1-Q4A", book: 6, sentence: "The man's adjusting his glasses.", answerStatus: "干扰项" });
    expect(adjust.sense.part1!.visualClues[0]).toBe("看手指是否接触镜框并调整位置");
    expect(adjust.sense.examples.map((x) => x.role)).toEqual(["learn", "test", "test", "test", "test"]);
    expect(adjust.sense.examples[0]).toMatchObject({ kind: "original", source: "公式问题集 6 · Test 1 · Q4(A) · 干扰项" });

    // 已有的 examine：复用义项，原始释义和编辑内容不变，同时加入托业
    const ex = index.get("p052")!;
    expect(ex.sense.id).toBe("examine#1");
    expect(ex.entry.decks).toEqual(["toefl", "toeic"]);
    expect(ex.entry.meaning).toBe(before.entries["examine"].meaning);
    expect(ex.sense.gloss).toBe(before.entries["examine"].senses[0].gloss);

    // 图片在 IndexedDB 里；断开连接（相当于刷新页面）后仍能读取
    expect((await listImageKeys()).size).toBe(240);
    resetImageStoreForTests();
    expect(await getImageUrl(adjust.sense.part1!.image!.sha256)).toMatch(/^blob:/);
    // 词库写入 localStorage 后恢复
    saveState(state);
    expect(part1Index(loadState()).size).toBe(240);
  });

  it("重复导入同一个包：没有重复词条，编辑内容和复习进度保留，图片不重复保存", async () => {
    const { state: first, pack } = await withPack();
    let s = first;
    const reach = part1Index(s).get("p153")!;
    s = introduce(s, reach.entry.id, reach.sense.id, "2026-11-17");
    s = recordAnswer(s, { card: { id: "a", type: "part1", entryId: reach.entry.id, senseId: reach.sense.id, exampleId: "part1-reach-hold-cup-study/q1" }, result: "wrong", day: "2026-11-17", chosen: "p078" });
    const adjust = part1Index(s).get("p001")!;
    s = updateEntry(s, "adjust", { senses: [{ ...adjust.sense, gloss: "调整（我改过的义项）" }], note: "我的备注" });
    const before = structuredClone(s);

    const keys = await listImageKeys();
    const plan = planPart1Import(s, pack, keys);
    expect(plan.counts).toMatchObject({ new: 0, reuseSense: 0, newSense: 0, already: 240 });
    expect(plan.images).toMatchObject({ alreadyStored: 240, toStore: 0 });
    const stored = await storePackImages(pack, new Set(keys), putImages);
    expect(stored).toMatchObject({ stored: 0, already: 240 });
    const { state: after, report } = applyPart1Import(s, pack, plan, stored.refs);

    expect(report).toMatchObject({ added: 0, already: 240, filled: 0 });
    expect(after.order).toEqual(before.order);
    expect(after.entries).toEqual(before.entries);
    expect(after.tracks).toEqual(before.tracks);
    expect(after.logs).toEqual(before.logs);
    expect(after.entries["adjust"].senses[0].gloss).toBe("调整（我改过的义项）");
    expect(after.part1!.groups).toHaveLength(1);
    expect(after.part1!.groups[0].questions).toHaveLength(2);
    expect((await listImageKeys()).size).toBe(240);
  });

  it("只补齐缺少的数据：丢失的图片引用和出处补回来，编辑过的义项不动", async () => {
    const { state, pack } = await withPack();
    const adjust = part1Index(state).get("p001")!;
    const broken = updateEntry(state, "adjust", {
      senses: [{ ...adjust.sense, gloss: "我改过", part1: { ...adjust.sense.part1!, image: undefined, sources: adjust.sense.part1!.sources.slice(0, 2) } }],
    });
    const keys = await listImageKeys();
    const stored = await storePackImages(pack, new Set(keys), putImages);
    const { state: after, report } = applyPart1Import(broken, pack, planPart1Import(broken, pack, keys), stored.refs);
    expect(report.filled).toBe(1);
    const s = after.entries["adjust"].senses[0];
    expect(s.gloss).toBe("我改过");
    expect(s.part1!.image?.sha256).toBe(adjust.sense.part1!.image!.sha256);
    expect(s.part1!.sources).toHaveLength(5);
  });

  it("缺图的包：预览列出缺失图片，词条仍可导入；对照图缺失的题不进入正式复习", async () => {
    const zip = await JSZip.loadAsync(packZip());
    zip.remove("toeic-part1-image-pack/images/p005.webp");
    zip.remove("toeic-part1-image-pack/images/p153.webp");
    const pack = await readPart1Pack(await zip.generateAsync({ type: "uint8array" }), "缺图.zip");
    expect(pack.missingImages.map((m) => m.phraseId)).toEqual(["p005", "p153"]);
    expect(pack.groups[0].eligible).toBe(false);
    expect(pack.groups[0].reasons.join()).toContain("p153（reach for）缺少图片");
    const { state, plan } = await withPack(undefined, pack);
    expect(plan.images).toMatchObject({ inZip: 238, missing: 2 });
    expect(part1Index(state).size).toBe(240);
    expect(part1Index(state).get("p005")!.sense.part1!.image).toBeUndefined();
    expect(part1Questions(state)).toEqual([]);
  });
});

describe("听音选图：排期和统计", () => {
  it("reach for / hold：答错进入专项复习、本轮重做不计分；文字回忆进度不受影响", async () => {
    const { state: s0 } = await withPack();
    const D = "2026-11-17";
    const D1 = "2026-11-18";
    const qs = part1Questions(s0);
    expect(qs.map((q) => [q.audioText, q.correctPhraseId])).toEqual([
      ["The woman is reaching for a cup.", "p153"],
      ["The woman is holding a cup.", "p078"],
    ]);
    // 其余 238 张图没有对照题，只用于学习
    expect(new Set(qs.map((q) => q.senseId)).size).toBe(2);

    let s = introduce(s0, "reach for", "reach for#p153", "2026-11-10");
    s = recordAnswer(s, { card: { id: "t", type: "text", entryId: "reach for", senseId: "reach for#p153" }, result: "good", day: "2026-11-11" });
    const textBefore = s.tracks[trackKey("reach for#p153", "text")];

    const queue = buildPart1Queue(scopeState(s, "toeic"), D);
    expect(queue.map((c) => [c.senseId, c.exampleId])).toEqual([
      ["reach for#p153", "part1-reach-hold-cup-study/q1"],
      ["hold#p078", "part1-reach-hold-cup-study/q2"],
    ]);
    let session: Session = { day: D, scope: "part1", queue, index: 0 };
    // 第 1 题：听到 reaching for，却选了 hold 的图
    s = recordAnswer(s, { card: queue[0], result: "wrong", day: D, plays: 2, chosen: "p078" });
    session = advanceSession(session, true);
    expect(session.queue.map((c) => c.retry ?? 0)).toEqual([0, 0, 1]);
    // 第 2 题首听答对
    s = recordAnswer(s, { card: session.queue[1], result: "first", day: D, plays: 1 });
    session = advanceSession(session, false);
    // 本轮重做 reach for：答对，但不改排期
    const reachTrack = s.tracks[trackKey("reach for#p153", "part1")];
    s = recordAnswer(s, { card: session.queue[2], result: "first", day: D, plays: 1 });
    expect(s.tracks[trackKey("reach for#p153", "part1")]).toEqual(reachTrack);
    expect(reachTrack).toMatchObject({ kind: "part1", stage: 0, due: D1, lapses: 1, lastItem: "part1-reach-hold-cup-study/q1" });
    expect(s.tracks[trackKey("hold#p078", "part1")]).toMatchObject({ stage: 0, due: D1, lapses: 0 });
    // 文字回忆是另一条进度
    expect(s.tracks[trackKey("reach for#p153", "text")]).toEqual(textBefore);

    const st = computeStats(s, D);
    expect(st.part1).toMatchObject({ total: 2, first: 1, replay: 0, wrong: 1, firstRate: 50, retries: 1, retryCorrect: 1 });
    expect(confusions(s)).toEqual([{ phraseIds: ["p078", "p153"], phrases: ["hold", "reach for"], count: 1, groupTitle: "伸手去取、伸进容器与已拿住" }]);

    // 次日：专项和今日复习里都有这两题；托福视图不出 Part 1
    expect(buildPart1Queue(scopeState(s, "toeic"), D1).map((c) => c.senseId).sort()).toEqual(["hold#p078", "reach for#p153"]);
    expect(buildQueue(scopeState(s, "toeic"), D1, { includeNew: false }).filter((c) => c.type === "part1")).toHaveLength(2);
    expect(buildQueue(scopeState(s, "toefl"), D1, { includeNew: false, exclude: ["part1"] }).filter((c) => c.type === "part1")).toHaveLength(0);
    expect(trackStatus(s.tracks[trackKey("reach for#p153", "part1")], D1)).toBe("due");

    // 次日首听答对 → 第 3 天
    const c1 = buildPart1Queue(s, D1).find((c) => c.senseId === "reach for#p153")!;
    s = recordAnswer(s, { card: c1, result: "first", day: D1 });
    expect(s.tracks[trackKey("reach for#p153", "part1")]).toMatchObject({ stage: 1, due: "2026-11-20" });
  });
});

describe("听音选图卡片", () => {
  it("提交前隐藏原句、目标短语、答案和线索；图片随机排列；提交后显示依据", async () => {
    const { state } = await withPack();
    const q = part1Questions(state)[0];
    const speakFn = vi.fn(async () => ({ ok: true as const }));
    const onDone = vi.fn();
    const shuffleMock = vi.fn((xs: unknown[]) => xs.slice().reverse());
    const shuffle = shuffleMock as unknown as <T>(xs: T[]) => T[];
    const { container } = render(<Part1Card question={q} settings={state.settings} onDone={onDone} speakFn={speakFn} shuffle={shuffle} />);
    expect(shuffleMock).toHaveBeenCalledTimes(1);

    const html = container.innerHTML.toLowerCase();
    for (const hidden of ["reaching", "reach for", "holding", "hold", "cup", "伸手", "握着", "空隙", "杯柄", "p153", "p078"]) expect(html, hidden).not.toContain(hidden);
    const pics = screen.getAllByRole("radio");
    expect(pics.map((p) => p.getAttribute("aria-label"))).toEqual(["图片 A", "图片 B"]);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(Array.from(container.querySelectorAll("img")).map((i) => i.alt)).toEqual(["图片 A", "图片 B"]);

    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    expect(speakFn).toHaveBeenCalledWith("The woman is reaching for a cup.", expect.anything());
    expect(container.innerHTML).not.toContain("reaching");
    // 倒序后图片 A 是 hold（错误答案）
    fireEvent.click(pics[0]);
    fireEvent.click(screen.getByText("提交"));
    const reveal = screen.getByTestId("part1-reveal");
    expect(reveal.textContent).toContain("答错");
    expect(screen.getByTestId("part1-sentence").textContent).toBe("The woman is reaching for a cup.");
    expect(container.textContent).toContain("手伸向杯子，手指和杯子之间仍有空隙。");
    expect(container.textContent).toContain("手握住杯柄，杯子已经离开台面。");
    expect(container.textContent).toContain("✗ 你选的 · hold");
    expect(container.textContent).toContain("✓ 正确 · reach for");
    fireEvent.click(screen.getByText("下一题 →"));
    expect(onDone).toHaveBeenCalledWith({ result: "wrong", plays: 1, chosen: "p078", audioFallback: undefined });
  });

  it("默认随机排列：多次打开两种顺序都会出现", async () => {
    const { state } = await withPack();
    const q = part1Questions(state)[0];
    const orders = new Set<string>();
    const spy = vi.spyOn(Math, "random");
    for (const r of [0.1, 0.9, 0.1, 0.9]) {
      spy.mockReturnValue(r);
      const v = render(<Part1Card question={q} settings={state.settings} onDone={() => {}} speakFn={async () => ({ ok: true })} />);
      fireEvent.click(screen.getAllByRole("radio")[0]);
      await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
      fireEvent.click(screen.getByText("提交"));
      orders.add(screen.getByTestId("part1-reveal").textContent!.includes("答错") ? "hold-first" : "reach-first");
      v.unmount();
    }
    spy.mockRestore();
    expect(orders).toEqual(new Set(["hold-first", "reach-first"]));
  });
});

describe("整个应用", () => {
  function mockSpeech() {
    class U {
      text: string;
      onstart?: () => void;
      onerror?: () => void;
      voice?: unknown;
      lang = "";
      rate = 1;
      constructor(t: string) {
        this.text = t;
      }
    }
    const spoken: string[] = [];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true, writable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [{ lang: "en-US", name: "Samantha", voiceURI: "sam" }],
        speak: (u: U) => {
          spoken.push(u.text);
          setTimeout(() => u.onstart?.(), 0);
        },
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = U;
    return spoken;
  }

  it("词库 → 托业：导入 Part 1 图片词库（先预览再确认），按 Part 1 / 类别筛选，词条页能看无配对题的图片", async () => {
    saveState(await importedState());
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "词库" }));
    expect(screen.queryByTestId("part1-zip-input")).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "词库" })).getByRole("button", { name: /^托业/ }));
    const file = new File([packZip().slice().buffer as ArrayBuffer], ZIP);
    fireEvent.change(screen.getByTestId("part1-zip-input"), { target: { files: [file] } });
    const preview = await screen.findByTestId("part1-preview", {}, { timeout: 20000 });
    expect(preview.textContent).toContain("可导入词条 240 条：新增 239 个词条，复用已有义项 1 个");
    expect(preview.textContent).toContain("图片 240 张：本机已有 0 张，待保存 240 张");
    expect(preview.textContent).toContain("examine → 复用义项「仔细检查；检查身体；审查」");
    expect(preview.textContent).toContain("缺失图片：0 张");
    expect(preview.textContent).toContain("通过校验 1 组 2 题");
    expect(loadState().order).toHaveLength(258); // 确认前不写入

    fireEvent.click(screen.getByText("确认导入到托业词库"));
    const report = await screen.findByTestId("part1-report", {}, { timeout: 30000 });
    expect(report.textContent).toContain("240 条短语，新增 239 个词条，复用已有义项 1 个");
    expect(report.textContent).toContain("新保存 240 张");
    expect(loadState().order).toHaveLength(497);

    fireEvent.click(screen.getByRole("button", { name: "Part 1 (240)" }));
    expect(document.querySelectorAll(".word-row")).toHaveLength(240);
    expect(screen.getByRole("button", { name: "人物动作 (173)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "物体状态 (72)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "位置关系 (11)" }));
    expect(document.querySelectorAll(".word-row")).toHaveLength(11);

    // adjust 没有对照题，词条页可以看到图片、线索和出处
    fireEvent.click(screen.getByRole("button", { name: "Part 1 (240)" }));
    fireEvent.click(screen.getByText("adjust"));
    await waitFor(() => expect(screen.getByAltText("adjust 配图").getAttribute("src")).toMatch(/^blob:/));
    expect(document.body.textContent).toContain("看手指是否接触镜框并调整位置");
    expect(document.body.textContent).toContain("公式问题集 6 · Test 1 · Q4(A) · 干扰项");
  });

  it("今日复习 → Part 1 专项 → 听音选图：播报、选图、揭晓，错题重做并进入次日复习", async () => {
    const spoken = mockSpeech();
    const { state } = await withPack();
    saveState({ ...state, settings: { ...state.settings, deck: "toeic" } });
    render(<App />);
    const entry = screen.getByTestId("part1-entry");
    expect(entry.textContent).toContain("看图学短语 240 张配图 · 听音选图可判分 2 题（待复习 0，新题 2）");
    fireEvent.click(within(entry).getByText("进入 Part 1 专项"));
    fireEvent.click(screen.getByText("开始听音选图（2 题）"));

    const answerWrong = async () => {
      const card = screen.getByTestId("part1-card");
      await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
      await waitFor(() => expect(card.textContent).toContain("已听 1 次"));
      fireEvent.click(screen.getByText("没听出来，看答案"));
      fireEvent.click(screen.getByText("下一题 →"));
    };
    const answerRight = async () => {
      await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
      await waitFor(() => expect(screen.getByTestId("part1-card").textContent).toContain("已听 1 次"));
      // 找到正确的图：依据保存的状态判断正确图片的 src
      const st = loadState();
      const card = st.session!.queue[st.session!.index];
      const q = part1Questions(st).find((x) => x.key === card.exampleId)!;
      const url = await getImageUrl(q.options.find((o) => o.phraseId === q.correctPhraseId)!.image.sha256);
      await waitFor(() => expect(screen.getByTestId("part1-card").querySelectorAll("img")).toHaveLength(2));
      const imgs = Array.from(screen.getByTestId("part1-card").querySelectorAll("img"));
      fireEvent.click(imgs.find((i) => i.getAttribute("src") === url)!.closest("button")!);
      fireEvent.click(screen.getByText("提交"));
      expect(screen.getByTestId("part1-reveal").textContent).toContain("首听答对");
      fireEvent.click(screen.getByText("下一题 →"));
    };

    expect(document.body.textContent).toContain("第 1 / 2 张 · Part 1 听音选图");
    await answerWrong(); // reach for 答错 → 隔几题重做
    expect(spoken[0]).toBe("The woman is reaching for a cup.");
    await answerRight(); // hold
    expect(document.body.textContent).toContain("第 3 / 3 张 · Part 1 听音选图 · 重做");
    await answerRight(); // reach for 重做
    expect(document.body.textContent).toContain("这一轮听音选图做完了");

    const saved = loadState();
    expect(saved.tracks[trackKey("reach for#p153", "part1")]).toMatchObject({ lapses: 1, stage: 0 });
    expect(saved.tracks[trackKey("hold#p078", "part1")]).toMatchObject({ lapses: 0 });
    const p1Logs = saved.logs.filter((l) => l.kind === "part1");
    expect(p1Logs.map((l) => [l.result, l.practice])).toEqual([
      ["wrong", false],
      ["first", false],
      ["first", true],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "学习记录" }));
    expect(screen.getByTestId("part1-stat").textContent).toContain("50%");
    expect(screen.getByTestId("part1-stat").textContent).toContain("本轮重做 1 次（答对 1），不计入");
  });
});

describe("练习题（自动出题，只算练习）", () => {
  const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it("可以指定题数和范围；每题两张不同的图，答案是场景句对应的那张", async () => {
    const { state } = await withPack();
    expect(practiceCount(state)).toBe(240);
    expect(practiceCount(state, "位置关系")).toBe(11);
    for (const n of [5, 10, 20]) expect(buildPart1Practice(state, { count: n, rng: seeded(n) })).toHaveLength(n);
    expect(buildPart1Practice(state, { count: 0 })).toHaveLength(240);
    expect(buildPart1Practice(state, { count: 999 })).toHaveLength(240);
    const loc = buildPart1Practice(state, { count: 0, category: "位置关系" });
    expect(loc).toHaveLength(11);

    const index = part1Index(state);
    const all = buildPart1Practice(state, { count: 0, rng: seeded(7) });
    expect(new Set(all.map((c) => c.senseId)).size).toBe(240);
    for (const c of all) {
      expect(c).toMatchObject({ type: "part1", free: true });
      const [t, d] = c.p1!.options;
      expect(t).toBe(c.p1!.correct);
      expect(d).not.toBe(t);
      expect(c.p1!.audio).toBe(index.get(t)!.sense.part1!.image!.sceneEn);
      const q = resolveCardQuestion(state, c)!;
      expect(q).toMatchObject({ practice: true, audioText: c.p1!.audio, senseId: c.senseId });
    }
  });

  it("干扰图：先用审核过的对照图和可做受控对照组，其次类别不同；不适合直接对照的组不互相做干扰", async () => {
    const { state } = await withPack();
    const index = part1Index(state);
    const all = buildPart1Practice(state, { count: 0, rng: seeded(3) });
    const distractor = (pid: string) => all.find((c) => c.p1!.correct === pid)!.p1!.options[1];
    expect(distractor("p153")).toBe("p078"); // reach for ↔ hold（审核过）
    expect(distractor("p078")).toBe("p153");
    expect(distractor("p036")).toBe("p190"); // crouch in front of ↔ stand in front of
    expect(["p009", "p012"]).toContain(distractor("p012")); // be in ↔ be on
    expect(distractor("p198")).toBe("p106"); // sweep ↔ mop

    const unsuitable = state.part1!.contrastGroups.filter((g) => g.suitability !== "可做受控对照");
    const controlled = new Set(state.part1!.contrastGroups.filter((g) => g.suitability === "可做受控对照").flatMap((g) => g.phraseIds));
    for (const c of all) {
      const [t, d] = c.p1!.options;
      // 这两张杯子图是审核过的对照图，优先于对照组的一般结论
      const reviewedPair = [t, d].sort().join() === "p078,p153";
      if (!reviewedPair) for (const g of unsuitable) expect(g.phraseIds.includes(t) && g.phraseIds.includes(d), `${t} ${d} ${g.id}`).toBe(false);
      if (controlled.has(t) || t === "p153" || t === "p078") continue;
      const ct = index.get(t)!.sense.part1!.categories;
      const cd = index.get(d)!.sense.part1!.categories;
      expect(ct.some((x) => cd.includes(x)), `${t} ${d}`).toBe(false);
    }
  });

  it("练习题不建复习进度、不计入首听正确率；单独统计；下一轮优先出没练过的", async () => {
    const { state: s0 } = await withPack();
    const cards = buildPart1Practice(s0, { count: 5, rng: seeded(11) });
    let s = s0;
    cards.forEach((c, i) => (s = recordAnswer(s, { card: c, result: i < 3 ? "first" : "wrong", day: "2026-11-17", chosen: i < 3 ? undefined : c.p1!.options[1] })));
    expect(Object.values(s.tracks).filter((t) => t.kind === "part1")).toEqual([]);
    const st = computeStats(s, "2026-11-17");
    expect(st.part1).toMatchObject({ total: 0, firstRate: null, retries: 0, practice: { total: 5, first: 3, wrong: 2, firstRate: 60 } });
    expect(confusions(s)).toEqual([]);
    // 正式题仍然是 2 道新题
    expect(buildPart1Queue(s, "2026-11-17")).toHaveLength(2);
    const next = buildPart1Practice(s, { count: 235, rng: seeded(12) });
    const done = new Set(cards.map((c) => c.senseId));
    expect(next.some((c) => done.has(c.senseId))).toBe(false);
  });

  it("界面：选范围和题数，开始一轮练习题，提交前不显示场景句", async () => {
    const { state } = await withPack();
    saveState({ ...state, settings: { ...state.settings, deck: "toeic" } });
    render(<App />);
    fireEvent.click(screen.getByText("进入 Part 1 专项"));
    const panel = screen.getByTestId("part1-practice");
    expect(within(panel).getByRole("button", { name: "开始练习（10 题）" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "5" }));
    expect(within(panel).getByRole("button", { name: "开始练习（5 题）" })).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("自定义题数"), { target: { value: "7" } });
    expect(loadState().settings.part1PracticeCount).toBe(7);
    fireEvent.click(within(panel).getByRole("button", { name: "位置关系 11" }));
    fireEvent.click(within(panel).getByRole("button", { name: "全部" }));
    expect(within(panel).getByRole("button", { name: "开始练习（11 题）" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "开始练习（11 题）" }));

    expect(document.body.textContent).toContain("第 1 / 11 张 · Part 1 听音选图 · 练习题");
    const saved = loadState();
    const card = saved.session!.queue[0];
    expect(screen.getByTestId("part1-card").textContent).toContain("练习题（不计入复习）");
    expect(document.body.innerHTML).not.toContain(card.p1!.audio);
    fireEvent.click(screen.getByText("没听出来，看答案"));
    expect(screen.getByTestId("part1-sentence").textContent).toBe(card.p1!.audio);
    fireEvent.click(screen.getByText("下一题 →"));
    const after = loadState();
    expect(after.logs.at(-1)).toMatchObject({ kind: "part1", free: true, practice: true, result: "wrong" });
    expect(Object.values(after.tracks).some((t) => t.kind === "part1")).toBe(false);
    // 答错的练习题本轮也会重做
    expect(after.session!.queue).toHaveLength(12);
  });
});
