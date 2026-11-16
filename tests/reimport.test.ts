import { describe, expect, it } from "vitest";
import { importedState, loadFixtureRows } from "./helpers";
import { importRows, updateEntry } from "../src/lib/library";
import { introduce, recordAnswer, trackKey } from "../src/lib/scheduler";
import { loadState, saveState } from "../src/lib/storage";

describe("重复导入保留进度", () => {
  it("再次导入同一份文件：不新增、不重复，复习进度和编辑内容不变", async () => {
    let state = await importedState();
    // 学习并复习几个义项
    state = introduce(state, "property", "property#trait", "2026-11-16");
    state = introduce(state, "reef", "reef#1", "2026-11-16");
    state = recordAnswer(state, { card: { id: "c1", type: "text", entryId: "property", senseId: "property#trait" }, result: "good", day: "2026-11-17" });
    state = recordAnswer(state, {
      card: { id: "c2", type: "listening", entryId: "property", senseId: "property#trait", exampleId: "property#trait/test1" },
      result: "subtitle",
      day: "2026-11-17",
    });
    // 编辑学习用义项、补充搭配和题目来源
    const reef = state.entries["reef"];
    state = updateEntry(state, "reef", {
      senses: [{ ...reef.senses[0], gloss: "礁；暗礁", origin: "user" }, reef.senses[1]],
      collocations: ["coral reef"],
      questionSource: "TPO 12 Reading",
    });
    state = updateEntry(state, "permanet", { correctedWord: "permanent", spelling: { ...state.entries["permanet"].spelling!, status: "confirmed" } });

    const tracksBefore = structuredClone(state.tracks);
    const logsBefore = state.logs.length;
    const entriesBefore = structuredClone(state.entries);

    const { rows } = await loadFixtureRows();
    const { state: after, report } = importRows(state, rows, "生词本.docx", "2026-11-20T08:00:00.000Z");

    expect(report).toMatchObject({ total: 258, added: 0, updated: 0, unchanged: 258 });
    expect(after.order).toHaveLength(258);
    expect(Object.keys(after.entries)).toHaveLength(258);
    expect(after.tracks).toEqual(tracksBefore);
    expect(after.logs).toHaveLength(logsBefore);
    expect(after.tracks[trackKey("property#trait", "text")]).toMatchObject({ stage: 1, due: "2026-11-19" });
    expect(after.tracks[trackKey("property#trait", "listening")]).toMatchObject({ stage: 0, due: "2026-11-18", lapses: 1 });
    expect(after.entries["reef"].senses[0].gloss).toBe("礁；暗礁");
    expect(after.entries["reef"].collocations).toEqual(["coral reef"]);
    expect(after.entries["reef"].questionSource).toBe("TPO 12 Reading");
    expect(after.entries["permanet"]).toMatchObject({ correctedWord: "permanent", spelling: { status: "confirmed" } });
    // 除导入时间外，词条内容完全不变
    for (const id of after.order) {
      expect({ ...after.entries[id], source: null }).toEqual({ ...entriesBefore[id], source: null });
      expect(after.entries[id].source.firstImportedAt).toBe(entriesBefore[id].source.firstImportedAt);
    }
  });

  it("原始释义改动时只更新原始内容，有进度的义项保持不变", async () => {
    let state = await importedState();
    state = introduce(state, "reef", "reef#1", "2026-11-16");
    const { rows } = await loadFixtureRows();
    const changed = rows.map((r) => (r.word === "reef" ? { ...r, meaning: "n.礁石" } : r));
    const { state: after, report } = importRows(state, changed, "生词本v2.docx");
    expect(report).toMatchObject({ added: 0, updated: 1, unchanged: 257, changedWords: ["reef"] });
    expect(after.entries["reef"].meaning).toBe("n.礁石");
    expect(after.entries["reef"].senses.map((s) => s.id)).toEqual(["reef#1", "reef#2"]);
    expect(after.tracks[trackKey("reef#1", "text")]).toEqual(state.tracks[trackKey("reef#1", "text")]);
  });

  it("词库和进度写入 localStorage，刷新后恢复", async () => {
    let state = await importedState();
    state = introduce(state, "glacier", "glacier#ice", "2026-11-16");
    localStorage.clear();
    expect(saveState(state)).toBeNull();
    const restored = loadState();
    expect(restored.order).toHaveLength(258);
    expect(restored.tracks).toEqual(state.tracks);
  });
});
