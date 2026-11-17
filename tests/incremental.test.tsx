import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { DOCX_PATH, importedState, loadFixtureRows } from "./helpers";
import { parseDocx } from "../src/lib/docx";
import { importRows, updateEntry } from "../src/lib/library";
import { introduce, recordAnswer, trackKey } from "../src/lib/scheduler";
import { loadState, saveState } from "../src/lib/storage";
import App from "../src/App";
import { goTab, openImport } from "./ui";

afterEach(() => cleanup());

/** 在附件词本末尾追加几行，模拟「之后又积累了新词，再导出一份全量词本」 */
async function expandedDocx(extra: { word: string; meaning: string }[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(readFileSync(DOCX_PATH));
  const xml = await zip.file("word/document.xml")!.async("string");
  const rows = xml.match(/<w:tr\b[^P][\s\S]*?<\/w:tr>/g)!;
  const last = rows[rows.length - 1];
  expect(last).toContain(">investigate<");
  const added = extra
    .map((x) => last.replace(">investigate<", `>${x.word}<`).replace(/>英 [^<]*</, ">英 /x/   美 /x/<").replace(">v.调查,研究<", `>${x.meaning}<`))
    .join("");
  const end = xml.lastIndexOf("</w:tbl>");
  zip.file("word/document.xml", xml.slice(0, end) + added + xml.slice(end));
  return zip.generateAsync({ type: "uint8array" });
}

const NEW = [
  { word: "sediment", meaning: "n.沉积物" },
  { word: "plateau", meaning: "n.高原" },
  { word: "Permanent", meaning: "adj.永久的" },
  { word: "Glacier", meaning: "n.冰川（大写重复）" },
];

describe("增量导入：只新增词库里没有的词", () => {
  it("全量词本再导入，只加新词；已有词条（含改过的、学过的）完全不动", async () => {
    let s = await importedState();
    s = introduce(s, "glacier", "glacier#ice", "2026-11-16");
    s = recordAnswer(s, { card: { id: "a", type: "text", entryId: "glacier", senseId: "glacier#ice" }, result: "good", day: "2026-11-17" });
    s = updateEntry(s, "reef", { collocations: ["coral reef"] });
    s = updateEntry(s, "permanet", { correctedWord: "permanent", spelling: { ...s.entries["permanet"].spelling!, status: "confirmed" } });
    const before = structuredClone(s);

    const parsed = await parseDocx(await expandedDocx(NEW));
    expect(parsed.rows).toHaveLength(262);
    // 全量词本里 reef 的释义也变了：只新增模式下不会覆盖
    const rows = parsed.rows.map((r) => (r.word === "reef" ? { ...r, meaning: "n.礁石（新版释义）" } : r));
    const { state: after, report } = importRows(s, rows, "生词本-全量.docx", "2026-12-01T08:00:00.000Z", { mode: "addOnly" });

    expect(report).toMatchObject({ mode: "addOnly", total: 262, added: 2, updated: 0, skippedExisting: 258 });
    // Permanent 对应已有的 permanet、Glacier 对应 glacier，它们在同一文件里都已出现过，算文件内重复
    expect(report.duplicatesInFile).toEqual(["Permanent", "Glacier"]);
    expect(report.addedWords).toEqual(["sediment", "plateau"]);
    expect(after.order).toHaveLength(260);
    expect(after.order.slice(-2)).toEqual(["sediment", "plateau"]);
    expect(after.entries["sediment"]).toMatchObject({ word: "sediment", meaning: "n.沉积物", createdAt: "2026-12-01T08:00:00.000Z" });
    // permanet 已确认改为 permanent → 全量词本里的 Permanent 不重复新增；Glacier 大小写不同也算已有
    expect(after.entries["permanent"]).toBeUndefined();
    expect(after.order.filter((id) => id === "glacier")).toHaveLength(1);
    // 已有 258 个词条一个字节都没变（包括原始释义、来源行号、编辑内容）
    for (const id of before.order) expect(after.entries[id]).toEqual(before.entries[id]);
    expect(after.entries["reef"].meaning).toBe("n.礁，暗礁,[矿]矿脉,[航]缩帆部，榫帆部vt.收帆，缩帆");
    expect(after.tracks).toEqual(before.tracks);
    expect(after.logs).toEqual(before.logs);

    // 同一份全量词本再导入一次：新增 0
    const again = importRows(after, rows, "生词本-全量.docx", undefined, { mode: "addOnly" });
    expect(again.report).toMatchObject({ added: 0, skippedExisting: 260 });
    expect(again.state.entries).toEqual(after.entries);
  });

  it("「新增并更新」模式：加新词，同时更新已有词的原始释义", async () => {
    const s = await importedState();
    const { rows } = await loadFixtureRows();
    const changed = [...rows.map((r) => (r.word === "reef" ? { ...r, meaning: "n.礁石" } : r)), { row: 259, word: "sediment", phonetic: "", meaning: "n.沉积物" }];
    const { state: after, report } = importRows(s, changed, "x.docx", undefined, { mode: "merge" });
    expect(report).toMatchObject({ added: 1, updated: 1, changedWords: ["reef"] });
    expect(after.entries["reef"].meaning).toBe("n.礁石");
  });
});

describe("增量导入：界面", () => {
  beforeEach(() => localStorage.clear());

  it("默认「只新增」，导入后列出新词，可以只看新增", async () => {
    let s = await importedState();
    s = introduce(s, "glacier", "glacier#ice", "2026-11-16");
    saveState(s);
    render(<App />);
    goTab("词库");
    openImport();
    expect((screen.getByLabelText(/只新增词库里没有的词/) as HTMLInputElement).checked).toBe(true);
    // 顶部选的是「全部」时，必须先选导入到哪个词库
    expect(screen.getByText("先选择导入到哪个词库").closest("button")!.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("托福词库"));

    const data = await expandedDocx(NEW);
    const file = new File([data.slice().buffer as ArrayBuffer], "生词本-全量.docx");
    fireEvent.change(screen.getByTestId("docx-input"), { target: { files: [file] } });
    const status = await screen.findByRole("status", {}, { timeout: 5000 });
    expect(status.textContent).toContain("增量导入「生词本-全量.docx」到托福词库：读取 262 条，新增 3 个，词库已有 258 个（内容未改动）");
    expect(screen.getByTestId("added-words").textContent).toContain("sediment、plateau、Permanent");
    // 拼写还没确认时，Permanent 是一个新词

    fireEvent.click(screen.getByText("只看新增"));
    const rows = document.querySelectorAll(".word-row");
    expect(Array.from(rows).map((r) => r.querySelector("strong")!.textContent)).toEqual(["sediment", "plateau", "Permanent"]);

    const saved = loadState();
    expect(saved.order).toHaveLength(261);
    expect(saved.tracks[trackKey("glacier#ice", "text")]).toEqual(s.tracks[trackKey("glacier#ice", "text")]);
  });
});
