import { useMemo, useRef, useState } from "react";
import type { AppState, ImportMode } from "../types";
import type { Update } from "../store";
import { parseDocx } from "../lib/docx";
import { displayWord, importRows, senseReady, type ImportReport } from "../lib/library";
import { STATUS_LABEL, trackKey, trackStatus } from "../lib/scheduler";
import { Pill } from "../components/common";
import EntryEditor from "../components/EntryEditor";

type Filter = "all" | "recent" | "curated" | "learning" | "spelling" | "noexample";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "curated", label: "已配练习" },
  { id: "learning", label: "学习中" },
  { id: "spelling", label: "疑似拼写" },
  { id: "noexample", label: "待补例句" },
];

export default function LibraryPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("addOnly");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const parsed = await parseDocx(await file.arrayBuffer());
      const r = importRows(state, parsed.rows, file.name, undefined, { mode: state.order.length ? mode : "merge" });
      update(() => r.state);
      setReport(r.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 最近一次有新增的导入，用于「上次新增」筛选
  const lastAdd = state.imports.slice(1).reverse().find((r) => r.added > 0);
  const learnedEntries = useMemo(() => new Set(Object.values(state.tracks).map((t) => t.entryId)), [state.tracks]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return state.order
      .map((id) => state.entries[id])
      .filter(Boolean)
      .filter((e) => {
        if (kw && !(e.word.toLowerCase().includes(kw) || e.meaning.includes(kw) || e.senses.some((s) => s.gloss.includes(kw)))) return false;
        switch (filter) {
          case "recent":
            return !!lastAdd && e.createdAt === lastAdd.at;
          case "curated":
            return e.curated;
          case "learning":
            return learnedEntries.has(e.id);
          case "spelling":
            return e.spelling?.status === "pending";
          case "noexample":
            return !e.senses.some((s) => senseReady(s).learn);
          default:
            return true;
        }
      });
  }, [state.order, state.entries, q, filter, learnedEntries, lastAdd]);

  const open = openId ? state.entries[openId] : undefined;
  if (open) return <EntryEditor entry={open} state={state} update={update} today={today} onClose={() => setOpenId(null)} />;

  const total = state.order.length;
  const curated = state.order.filter((id) => state.entries[id]?.curated).length;
  const spelling = state.order.filter((id) => state.entries[id]?.spelling?.status === "pending").length;

  return (
    <section className="stack">
      <div className="panel">
        <h2>词库</h2>
        <p className="hint">
          共 {total} 个词条 · 已配练习 {curated} 个 · 疑似拼写待确认 {spelling} 个
        </p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "正在读取…" : total ? "重新导入 / 导入新词本 (.docx)" : "导入 Word 生词本 (.docx)"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            data-testid="docx-input"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        {total > 0 && (
          <fieldset className="import-mode">
            <legend>再次导入时</legend>
            <label>
              <input type="radio" name="import-mode" checked={mode === "addOnly"} onChange={() => setMode("addOnly")} />
              <span>
                <b>只新增词库里没有的词</b>（推荐）：导入全量词本也只会加入新词，已有词条完全不动
              </span>
            </label>
            <label>
              <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
              <span>
                <b>新增，并更新已有词的原始音标 / 释义</b>：学习义项、例句和复习进度仍然保留
              </span>
            </label>
          </fieldset>
        )}
        <p className="hint">支持金山词霸「我的生词本」导出的表格（单词 / 音标 / 释义）。按单词匹配已有词条（不区分大小写，已确认的拼写更正也算），复习进度不会丢失。</p>
        {error && <div className="banner error">导入失败：{error}</div>}
        {report && (
          <div className="banner good" role="status">
            {report.mode === "addOnly" ? (
              <>
                增量导入「{report.file}」：读取 {report.total} 条，新增 {report.added} 个，词库已有 {report.skippedExisting} 个（未改动）。
              </>
            ) : (
              <>
                导入「{report.file}」：读取 {report.total} 条，新增 {report.added}，原始内容有变化 {report.updated}，未变 {report.unchanged}。
              </>
            )}
            {report.duplicatesInFile.length > 0 && <> 文件内重复 {report.duplicatesInFile.length} 条已跳过。</>}
            {report.spellingFlags > 0 && <> 有 {report.spellingFlags} 个词条疑似拼写错误，请在「疑似拼写」里确认。</>}
            {report.added > 0 && state.imports.length > 1 && (
              <div data-testid="added-words">
                新增：{report.addedWords.slice(0, 30).join("、")}
                {report.addedWords.length > 30 && ` 等 ${report.addedWords.length} 个`}
                <button className="link" onClick={() => setFilter("recent")}>
                  只看新增
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="panel">
          <div className="filters">
            <input className="search" placeholder="搜索单词或释义" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="seg">
              {[...FILTERS.slice(0, 1), ...(lastAdd ? [{ id: "recent" as Filter, label: `上次新增 (${lastAdd.added})` }] : []), ...FILTERS.slice(1)].map((f) => (
                <button key={f.id} className={filter === f.id ? "seg-btn active" : "seg-btn"} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hint">显示 {list.length} 条</div>
          <ul className="word-list">
            {list.map((e) => (
              <li key={e.id}>
                <button className="word-row" onClick={() => setOpenId(e.id)}>
                  <span className="wr-main">
                    <b>{displayWord(e)}</b>
                    {e.spelling?.status === "confirmed" && e.correctedWord && <span className="hint"> （原：{e.word}）</span>}
                    <span className="wr-meaning">{e.meaning}</span>
                  </span>
                  <span className="wr-tags">
                    {e.curated && <Pill tone="info">已配练习</Pill>}
                    {e.spelling?.status === "pending" && <Pill tone="warn">疑似拼写</Pill>}
                    {e.senses.length > 1 && <Pill>{e.senses.length} 个义项</Pill>}
                    {learnedEntries.has(e.id) && <SenseSummary state={state} entryId={e.id} today={today} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SenseSummary({ state, entryId, today }: { state: AppState; entryId: string; today: string }) {
  const e = state.entries[entryId];
  const st = (k: "text" | "listening" | "spelling") => {
    const all = e.senses.map((s) => trackStatus(state.tracks[trackKey(s.id, k)], today)).filter((x) => x !== "none");
    if (!all.length) return null;
    if (all.includes("due")) return "due";
    if (all.every((x) => x === "mastered")) return "mastered";
    return "learning";
  };
  const t = st("text");
  const l = st("listening");
  const sp = st("spelling");
  const tone = (x: string | null) => (x === "mastered" ? "good" : x === "due" ? "warn" : "plain");
  return (
    <>
      {t && <Pill tone={tone(t)}>文字{STATUS_LABEL[t as "due"]}</Pill>}
      {l && <Pill tone={tone(l)}>听力{STATUS_LABEL[l as "due"]}</Pill>}
      {sp && <Pill tone={tone(sp)}>拼写{STATUS_LABEL[sp as "due"]}</Pill>}
    </>
  );
}
