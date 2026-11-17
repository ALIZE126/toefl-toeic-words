import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { importedState } from "./helpers";
import { PASSAGES } from "../src/data/passages";
import { buildCloze, isBlankCorrect } from "../src/lib/cloze";
import { gradePassage, preparePassage, recordPassage } from "../src/lib/reading";
import { passageSentenceId, spellingItems } from "../src/lib/spelling";
import { buildQueue, computeStats, introduce, recordAnswer, trackKey, trackStatus } from "../src/lib/scheduler";
import { loadState, saveState } from "../src/lib/storage";
import SpellingCard from "../src/components/SpellingCard";
import App from "../src/App";

afterEach(() => cleanup());

const words = (t: string) => t.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];

describe("补全单词：出题", () => {
  it("3 篇短文，每篇 70–100 词、10 空、2–4 个生词本目标空，首句完整", async () => {
    const state = await importedState();
    expect(PASSAGES).toHaveLength(3);
    for (const p of PASSAGES) {
      const n = words(p.text).length;
      expect(n, p.id).toBeGreaterThanOrEqual(70);
      expect(n, p.id).toBeLessThanOrEqual(100);
      const prep = preparePassage(p);
      expect(prep.cloze.blanks).toHaveLength(10);
      // 首句没有挖空
      expect(prep.cloze.segments[0]).toEqual({ kind: "text", text: prep.cloze.firstSentence });
      // 每个目标词都落在挖空位置上，且对应词本里真实的词条和义项
      const hits = prep.targets.filter(Boolean);
      expect(hits.length).toBe(p.targets.length);
      expect(hits.length).toBeGreaterThanOrEqual(2);
      expect(hits.length).toBeLessThanOrEqual(4);
      for (const t of p.targets) {
        expect(state.entries[t.entryId], t.entryId).toBeTruthy();
        expect(state.entries[t.entryId].senses.map((s) => s.id)).toContain(t.senseId);
        // 目标词不会在挖空之外以完整形式出现（否则会泄露答案）
        expect(words(p.text).filter((w) => w.toLowerCase() === t.form)).toHaveLength(1);
      }
      // 普通空不是词本里的词
      prep.cloze.blanks.forEach((b, i) => {
        if (!prep.targets[i]) expect(state.entries[b.word.toLowerCase()], b.word).toBeUndefined();
      });
    }
  });

  it("隔一个词挖一个词的后半部分：Thousands of years ago, glaciers car___ deep valleys.", () => {
    const c = buildCloze(PASSAGES[0].text);
    const rest = words(PASSAGES[0].text.slice(c.firstSentence.length)).filter((w) => /^[A-Za-z]{2,}$/.test(w));
    expect(c.blanks.map((b) => b.word)).toEqual(rest.filter((_, i) => i % 2 === 1).slice(0, 10));
    const carved = c.blanks.find((b) => b.word === "carved")!;
    expect(carved).toMatchObject({ prefix: "car", answer: "ved" });
    expect(c.blanks.find((b) => b.word === "valleys")).toMatchObject({ prefix: "val", answer: "leys" });
    expect(c.blanks.find((b) => b.word === "erosion")).toMatchObject({ prefix: "ero", answer: "sion" });
  });

  it("按实际词形判分：carved 要填 ved，填 ves（carves）算错", () => {
    const carved = buildCloze(PASSAGES[0].text).blanks.find((b) => b.word === "carved")!;
    expect(isBlankCorrect(carved, "ved")).toBe(true);
    expect(isBlankCorrect(carved, " VED ")).toBe(true);
    expect(isBlankCorrect(carved, "ves")).toBe(false);
    expect(isBlankCorrect(carved, "ve")).toBe(false);
    expect(isBlankCorrect(carved, "")).toBe(false);
  });
});

describe("补全单词：进度", () => {
  it("文字意思答对、拼写答错的词进入拼写复习，下次换一句考，文字进度不变", async () => {
    const D0 = "2026-11-16";
    let s = await importedState();
    s = introduce(s, "carve", "carve#1", D0);
    s = recordAnswer(s, { card: { id: "t1", type: "text", entryId: "carve", senseId: "carve#1" }, result: "good", day: "2026-11-17" });
    const textBefore = s.tracks[trackKey("carve#1", "text")];
    expect(textBefore).toMatchObject({ stage: 1, due: "2026-11-19" });

    const prep = preparePassage(PASSAGES[0]);
    // 第 1 空是普通词 of，故意填错；carved 填成 carves
    expect(prep.cloze.blanks[0].word).toBe("of");
    const inputs = prep.cloze.blanks.map((b, i) => (b.word === "carved" ? "ves" : i === 0 ? "n" : b.answer));
    const results = gradePassage(prep, inputs);
    const { state: after, attempt } = recordPassage(s, PASSAGES[0], results, "2026-11-17");

    // 普通词（of 填错）计入短文成绩，不建任何轨道
    expect(attempt).toMatchObject({ score: 8, total: 10, targetCorrect: 2, targetTotal: 3 });
    expect(Object.keys(after.tracks).filter((k) => k.endsWith("|spelling"))).toEqual(["carve#1|spelling"]);

    const sp = after.tracks[trackKey("carve#1", "spelling")];
    expect(sp).toMatchObject({ kind: "spelling", stage: 0, due: "2026-11-18", lapses: 1, lastItem: passageSentenceId("p1-landforms", "carved") });
    // 文字回忆进度不受影响
    expect(after.tracks[trackKey("carve#1", "text")]).toEqual(textBefore);
    expect(trackStatus(after.tracks[trackKey("carve#1", "text")], "2026-11-18")).toBe("learning");
    expect(trackStatus(sp, "2026-11-18")).toBe("due");
    // 拼对的目标词（valleys、erosion）不会进入拼写复习
    expect(after.tracks[trackKey("valleys#1", "spelling")]).toBeUndefined();

    // 次日队列里有拼写题，用的是另一句话
    const q = buildQueue(after, "2026-11-18", { includeNew: false }).filter((c) => c.senseId === "carve#1");
    expect(q.map((c) => c.type)).toEqual(["spelling"]);
    const items = spellingItems(after, "carve", "carve#1");
    const item = items.find((i) => i.id === q[0].exampleId)!;
    expect(item.id).not.toBe(sp.lastItem);
    expect(item.text).not.toContain("Thousands of years ago");

    // 拼写复习答对：只推进拼写轨道，并记下这次用的句子
    const done = recordAnswer(after, { card: q[0], result: "correct", day: "2026-11-18" });
    expect(done.tracks[trackKey("carve#1", "spelling")]).toMatchObject({ stage: 1, due: "2026-11-20", lastItem: item.id });
    expect(done.tracks[trackKey("carve#1", "text")]).toEqual(textBefore);

    const st = computeStats(done, "2026-11-18");
    expect(st.spelling).toMatchObject({ total: 4, correct: 3 });
    expect(st.passages).toMatchObject({ attempts: 1, score: 8, total: 10, rate: 80 });
  });
});

describe("补全单词：界面", () => {
  beforeEach(() => localStorage.clear());

  it("每篇 10 个可输入的空；提交前答案和释义隐藏；提交后逐空反馈并写入拼写复习", async () => {
    let s = await importedState();
    s = introduce(s, "carve", "carve#1", "2026-11-10");
    saveState(s);
    render(<App />);
    fireEvent.click(screen.getByText("托福阅读"));
    fireEvent.click(screen.getByText("第 1 篇 · 地球科学"));

    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(10);
    for (const b of boxes) {
      expect(b.getAttribute("autocorrect")).toBe("off");
      expect(b.getAttribute("autocapitalize")).toBe("none");
      expect(b.getAttribute("spellcheck")).toBe("false");
      expect(b.getAttribute("autocomplete")).toBe("off");
      expect(b.tabIndex).not.toBe(-1);
      expect((b as HTMLInputElement).disabled).toBe(false);
    }
    // 空格按段落顺序排列，Tab 顺序即 DOM 顺序；回车跳到下一空
    boxes[0].focus();
    fireEvent.keyDown(boxes[0], { key: "Enter" });
    expect(document.activeElement).toBe(boxes[1]);

    const html = document.body.innerHTML;
    expect(html).toContain("car");
    for (const hidden of ["carved", "valleys", "erosion", "雕刻", "山谷", "侵蚀", "Thousands of years ago」", "过去式", "逐空反馈"]) {
      expect(html, hidden).not.toContain(hidden);
    }
    // 段落原位显示前半部分：Thousands o_ years a__, glaciers car___ deep val____ …
    expect(screen.getByTestId("passage").textContent).toContain("Thousands o years a, glaciers car deep val");

    const prep = preparePassage(PASSAGES[0]);
    prep.cloze.blanks.forEach((b, i) => fireEvent.change(boxes[i], { target: { value: b.word === "carved" ? "ves" : b.answer } }));
    fireEvent.click(screen.getByText("提交整篇"));

    expect(screen.getByRole("status").textContent).toContain("得分 9 / 10");
    const fb = screen.getByTestId("feedback").textContent!;
    expect(fb).toContain("你的输入：ves");
    expect(fb).toContain("正确字母：ved");
    expect(fb).toContain("完整单词：carved");
    expect(fb).toContain("「Thousands of years ago」说明是过去发生的事");
    expect(fb).toContain("雕刻");
    expect(screen.getAllByRole("textbox").every((b) => (b as HTMLInputElement).disabled)).toBe(true);

    const saved = loadState();
    expect(saved.tracks[trackKey("carve#1", "spelling")]).toMatchObject({ stage: 0, lapses: 1 });
    expect(saved.tracks[trackKey("carve#1", "text")]).toEqual(s.tracks[trackKey("carve#1", "text")]);
    expect(saved.passageAttempts).toHaveLength(1);
  });

  it("所有 3 篇都能打开并有 10 个输入框", async () => {
    saveState(await importedState());
    render(<App />);
    fireEvent.click(screen.getByText("托福阅读"));
    for (const p of PASSAGES) {
      fireEvent.click(screen.getByText(p.title));
      expect(screen.getAllByRole("textbox")).toHaveLength(10);
      for (const t of p.targets) expect(document.body.innerHTML).not.toContain(t.form);
      fireEvent.click(screen.getByText("← 返回短文列表"));
    }
  });

  it("拼写复习卡：提交前不显示完整单词和释义，按实际词形判分", async () => {
    const s = await importedState();
    const item = spellingItems(s, "carve", "carve#1")[0];
    const entry = s.entries["carve"];
    let got: string | null = null;
    render(<SpellingCard entry={entry} sense={entry.senses[0]} item={item} onDone={(r) => (got = r)} />);
    expect(document.body.innerHTML).not.toContain(item.form);
    expect(document.body.innerHTML).not.toContain("雕刻");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ves" } });
    fireEvent.click(screen.getByText("提交"));
    expect(screen.getByTestId("spelling-card").textContent).toContain("拼错了");
    expect(screen.getByTestId("spelling-card").textContent).toContain("雕刻");
    fireEvent.click(screen.getByText("下一题 →"));
    expect(got).toBe("wrong");
  });
});
