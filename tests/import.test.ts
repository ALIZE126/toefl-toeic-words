import { describe, expect, it } from "vitest";
import { importedState, loadFixtureRows } from "./helpers";
import { CURATED } from "../src/data/curated";
import { learnExample, senseReady, testExamples } from "../src/lib/library";

describe("导入附件生词本", () => {
  it("读取全部 258 条原始词条，内容与 Word 表格一致", async () => {
    const { rows, skipped } = await loadFixtureRows();
    expect(rows).toHaveLength(258);
    expect(skipped).toBe(0);
    expect(rows[0]).toEqual({
      row: 1,
      word: "colony",
      phonetic: "英 /ˈkɒləni/ 美 /ˈkɑːləni/",
      meaning: "n.殖民地,聚居人群,群体,(美国独立前的)北美十三州",
    });
    expect(rows[257].word).toBe("investigate");
    // 释义中的 < > 等字符按原样保留
    expect(rows.find((r) => r.word === "mollusk")?.meaning).toBe("n.<动>软体动物");
    expect(rows.find((r) => r.word === "permanet")?.phonetic).toBe("");
  });

  it("导入后词库有 258 个词条，保留原始单词 / 音标 / 释义", async () => {
    const state = await importedState();
    expect(state.order).toHaveLength(258);
    expect(Object.keys(state.entries)).toHaveLength(258);
    const p = state.entries["property"];
    expect(p.meaning).toBe("n.财产,房地产,特性,属性");
    expect(p.source.row).toBe(91);
  });

  it("提示疑似拼写错误 permanet → permanent，词形变化不误报", async () => {
    const state = await importedState();
    expect(state.entries["permanet"].spelling).toMatchObject({ suggestion: "permanent", status: "pending" });
    expect(state.entries["valleys"].spelling).toBeUndefined();
    expect(state.entries["fjords"].spelling).toBeUndefined();
    expect(state.entries["colony"].spelling).toBeUndefined();
  });

  it("30 个配好练习的实际词条，每个义项有学习句和不同的复测句", async () => {
    const state = await importedState();
    expect(CURATED).toHaveLength(30);
    const curated = state.order.filter((id) => state.entries[id].curated);
    expect(curated).toHaveLength(30);
    for (const w of ["postpone", "seminar", "property", "approach", "glacier", "erosion"]) expect(curated).toContain(w);
    for (const id of curated) {
      for (const s of state.entries[id].senses) {
        expect(senseReady(s), `${id} ${s.gloss}`).toEqual({ learn: true, test: true });
        const learn = learnExample(s)!;
        for (const t of testExamples(s)) {
          expect(t.text).not.toBe(learn.text);
          expect(t.kind).toBe("self"); // 自编例句
          expect(t.listenQ?.options[t.listenQ.answer]).toBeTruthy();
        }
      }
    }
    expect(state.entries["property"].senses.map((s) => s.gloss)).toEqual(["特性；（物理、化学）性质", "财产；房产"]);
    const pp = state.entries["postpone"].senses[0];
    expect(learnExample(pp)?.text).toBe("They postponed the seminar until Friday.");
    expect(testExamples(pp)[0]).toMatchObject({ text: "We'll have to postpone the client meeting.", listenQ: { prompt: "客户会议要怎么处理？" } });
  });

  it("未配练习的词条按词性拆出默认学习义项", async () => {
    const state = await importedState();
    expect(state.entries["reef"].senses.map((s) => [s.pos, s.gloss])).toEqual([
      ["n.", "礁；暗礁；[矿]矿脉"],
      ["vt.", "收帆；缩帆"],
    ]);
    expect(state.entries["orographic"].senses[0]).toMatchObject({ pos: "", gloss: "地形的；山岳形态的" });
  });
});
