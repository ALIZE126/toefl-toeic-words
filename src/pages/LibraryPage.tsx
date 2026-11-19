import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, DeckId, ImportMode } from "../types";
import { DECKS, DECK_NAME, entryDecks, scopeState } from "../lib/decks";
import type { Update } from "../store";
import { parseDocx } from "../lib/docx";
import { displayWord, importRows, senseReady, type ImportReport } from "../lib/library";
import { STATUS_LABEL, trackKey, trackStatus } from "../lib/scheduler";
import { Pill } from "../components/common";
import EntryEditor from "../components/EntryEditor";
import Part1ImportPanel from "../components/Part1ImportPanel";
import AudioPackImport from "../components/AudioPackImport";
import { hasPart1, part1Categories } from "../lib/part1";
import { useNav } from "../components/nav";
import Icon from "../components/Icon";

type Filter = "all" | "recent" | "curated" | "learning" | "spelling" | "noexample" | "part1" | "p1:人物动作" | "p1:物体状态" | "p1:位置关系";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "learning", label: "学习中" },
  { id: "curated", label: "已配练习" },
  { id: "spelling", label: "疑似拼写" },
  { id: "noexample", label: "待补例句" },
];

const PAGE = 120;

/** 词库：首屏是搜索、筛选和词条；「导入」打开面板（Word 生词本 / Part 1 图片包） */
export default function LibraryPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const nav = useNav();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [importOpen, setImportOpen] = useState(nav.route.sub === "import" || nav.route.sub === "import-part1" || !state.order.length);
  const listScroll = useRef(0);
  const viewDeck = state.settings.deck;
  const scoped = useMemo(() => scopeState(state, viewDeck), [state, viewDeck]);

  useEffect(() => {
    if (nav.route.sub === "import" || nav.route.sub === "import-part1") setImportOpen(true);
  }, [nav.route]);

  // 最近一次有新增的导入，用于「上次新增」筛选
  const lastAdd = state.imports.slice(1).reverse().find((r) => r.added > 0);
  const total = scoped.order.length;
  const p1Count = scoped.order.filter((id) => hasPart1(scoped.entries[id])).length;

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return scoped.order
      .map((id) => scoped.entries[id])
      .filter(Boolean)
      .filter((e) => {
        if (
          kw &&
          !(
            e.word.toLowerCase().includes(kw) ||
            (e.correctedWord ?? "").toLowerCase().includes(kw) ||
            e.meaning.includes(kw) ||
            e.senses.some((s) => s.gloss.includes(kw)) ||
            e.collocations.some((c) => c.toLowerCase().includes(kw))
          )
        )
          return false;
        switch (filter) {
          case "part1":
            return hasPart1(e);
          case "p1:人物动作":
          case "p1:物体状态":
          case "p1:位置关系":
            return part1Categories(e).includes(filter.slice(3));
          case "recent":
            return !!lastAdd && e.createdAt === lastAdd.at;
          case "curated":
            return e.curated;
          case "learning":
            return Object.values(scoped.tracks).some((t) => t.entryId === e.id);
          case "spelling":
            return e.spelling?.status === "pending";
          case "noexample":
            return !e.senses.some((s) => senseReady(s).learn);
          default:
            return true;
        }
      });
  }, [scoped, q, filter, lastAdd]);

  const open = openId ? state.entries[openId] : undefined;
  if (open) {
    return (
      <EntryEditor
        entry={open}
        state={state}
        update={update}
        today={today}
        onClose={() => {
          const id = openId;
          setOpenId(null);
          // 回到列表原来的筛选和滚动位置，并定位到刚才的词条
          requestAnimationFrame(() => {
            window.scrollTo?.(0, listScroll.current);
            document.getElementById(`row-${id}`)?.focus({ preventScroll: true });
          });
        }}
      />
    );
  }

  const filters = [
    ...FILTERS.slice(0, 1),
    ...(lastAdd ? [{ id: "recent" as Filter, label: `本次新增 ${lastAdd.added}` }] : []),
    ...(p1Count
      ? (["part1", "p1:人物动作", "p1:物体状态", "p1:位置关系"] as Filter[]).map((id) => ({
          id,
          label:
            id === "part1"
              ? `Part 1 (${p1Count})`
              : `${id.slice(3)} (${scoped.order.filter((x) => part1Categories(scoped.entries[x]).includes(id.slice(3))).length})`,
        }))
      : []),
    ...FILTERS.slice(1),
  ];

  return (
    <section className="page">
      <div className="row spread">
        <h2>{viewDeck === "all" ? "词库" : `${DECK_NAME[viewDeck]}词库`}</h2>
        <button type="button" className="btn-plain import-toggle" aria-expanded={importOpen} aria-controls="import-panel" onClick={() => setImportOpen((x) => !x)}>
          <Icon name="upload" size={16} />
          导入
        </button>
      </div>
      <p className="muted small">{total} 个词条</p>

      {importOpen && <ImportPanel state={state} update={update} onClose={() => setImportOpen(false)} onShowRecent={() => setFilter("recent")} />}

      {state.order.length > 0 && (
        <>
          <label className="sr-only" htmlFor="lib-search">
            搜索词条
          </label>
          <input id="lib-search" className="search" type="search" placeholder="搜索单词、短语或中文" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="filters" aria-label="词条筛选">
            {filters.map((f) => (
              <button key={f.id} type="button" className="filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {(q || filter !== "all") && <p className="muted small">显示 {list.length} 条</p>}
          {list.length === 0 && <p className="muted small">没有匹配的词条</p>}
          <ul className="word-list">
            {list.slice(0, limit).map((e) => {
              const gloss = e.senses.map((s) => s.gloss).filter(Boolean).slice(0, 2).join("；") || e.meaning;
              return (
                <li key={e.id}>
                  <button
                    id={`row-${e.id}`}
                    type="button"
                    className="word-row"
                    onClick={() => {
                      listScroll.current = window.scrollY;
                      setOpenId(e.id);
                    }}
                  >
                    <span className="row spread">
                      <strong>
                        {displayWord(e)}
                        {e.spelling?.status === "confirmed" && e.correctedWord && <span className="muted small"> （原：{e.word}）</span>}
                      </strong>
                      <span className="wr-tags">
                        <StatusPill state={state} entryId={e.id} today={today} />
                        {e.spelling?.status === "pending" && <Pill tone="warn">疑似拼写</Pill>}
                      </span>
                    </span>
                    <span className="wr-meaning">
                      {gloss}
                      {e.collocations[0] ? ` · ${e.collocations[0]}` : ""}
                    </span>
                    <span className="wr-tags">
                      {viewDeck === "all" && entryDecks(e).map((d) => <Pill key={d}>{DECK_NAME[d]}</Pill>)}
                      {hasPart1(e) && <Pill tone="info">Part 1</Pill>}
                      {e.curated && <Pill tone="info">已配练习</Pill>}
                      {e.senses.length > 1 && <Pill>{e.senses.length} 个义项</Pill>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > limit && (
            <button type="button" className="btn-secondary wide" onClick={() => setLimit(limit + PAGE)}>
              再显示 {Math.min(PAGE, list.length - limit)} 个（共 {list.length}）
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** 词条的整体状态：任一练习待复习 → 待复习；有进度 → 学习中；全部掌握 → 已掌握 */
function StatusPill({ state, entryId, today }: { state: AppState; entryId: string; today: string }) {
  const e = state.entries[entryId];
  const all = e.senses.flatMap((s) =>
    (["text", "listening", "context", "spelling", "part1"] as const).map((k) => trackStatus(state.tracks[trackKey(s.id, k)], today)),
  );
  const has = all.filter((x) => x !== "none");
  if (!has.length) return null;
  const st = has.includes("due") ? "due" : has.every((x) => x === "mastered") ? "mastered" : "learning";
  return <Pill tone={st === "due" ? "warn" : st === "mastered" ? "good" : "info"}>{STATUS_LABEL[st]}</Pill>;
}

/** 导入面板：Word 生词本（目标词库 + 更新方式）和 Part 1 图片包（固定导入托业） */
function ImportPanel({ state, update, onClose, onShowRecent }: { state: AppState; update: Update; onClose: () => void; onShowRecent: () => void }) {
  const nav = useNav();
  const viewDeck = state.settings.deck;
  const [kind, setKind] = useState<"docx" | "part1" | "audio">(nav.route.sub === "import-part1" ? "part1" : "docx");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("addOnly");
  const [importDeck, setImportDeck] = useState<DeckId | null>(viewDeck === "all" ? null : viewDeck);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasAny = state.order.length > 0;

  useEffect(() => {
    if (nav.route.sub === "import-part1") setKind("part1");
  }, [nav.route]);

  const onFile = async (file: File) => {
    if (!importDeck) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const parsed = await parseDocx(await file.arrayBuffer());
      const r = importRows(state, parsed.rows, file.name, undefined, { mode: state.order.length ? mode : "merge", deck: importDeck });
      update(() => r.state);
      setReport(r.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="import-panel" id="import-panel" role="region" aria-label="导入">
      <div className="row spread">
        <div className="tabs-mini" role="tablist" aria-label="导入类型">
          <button type="button" role="tab" aria-selected={kind === "docx"} className="filter" aria-pressed={kind === "docx"} onClick={() => setKind("docx")}>
            Word 生词本
          </button>
          <button type="button" role="tab" aria-selected={kind === "part1"} className="filter" aria-pressed={kind === "part1"} onClick={() => setKind("part1")}>
            Part 1 图片包
          </button>
          <button type="button" role="tab" aria-selected={kind === "audio"} className="filter" aria-pressed={kind === "audio"} onClick={() => setKind("audio")}>
            AI 语音包
          </button>
        </div>
        {hasAny && (
          <button type="button" className="icon-btn" aria-label="收起导入面板" onClick={onClose}>
            <Icon name="x" />
          </button>
        )}
      </div>

      {kind === "part1" ? (
        <Part1ImportPanel state={state} update={update} />
      ) : kind === "audio" ? (
        <AudioPackImport />
      ) : (
        <div className="import-body">
          <fieldset className="import-mode">
            <legend>目标词库</legend>
            <div className="row wrap">
              {DECKS.map((d) => (
                <label key={d.id} className="deck-choice">
                  <input type="radio" name="import-deck" checked={importDeck === d.id} onChange={() => setImportDeck(d.id)} />
                  <span>{d.name}词库</span>
                </label>
              ))}
            </div>
            <span className="muted small">词库里已有的词会同时加入所选词库，复习进度共享。</span>
          </fieldset>
          {hasAny && (
            <fieldset className="import-mode">
              <legend>词库里已有词时</legend>
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
          <button type="button" className="btn-primary" disabled={busy || !importDeck} onClick={() => fileRef.current?.click()}>
            {busy ? "正在读取…" : !importDeck ? "先选择导入到哪个词库" : `选择 .docx 导入到${DECK_NAME[importDeck]}词库`}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            data-testid="docx-input"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <p className="muted small">支持金山词霸「我的生词本」导出的表格（单词 / 音标 / 释义）。按单词匹配已有词条（不区分大小写，已确认的拼写更正也算），复习进度不会丢失。</p>
          {error && (
            <div className="banner error" role="alert">
              导入失败：{error}
              <button type="button" className="btn-secondary small" onClick={() => fileRef.current?.click()}>
                重新选择文件
              </button>
            </div>
          )}
          {report && (
            <div className="banner good" role="status">
              {report.mode === "addOnly" ? (
                <>
                  增量导入「{report.file}」到{DECK_NAME[report.deck ?? "toefl"]}词库：读取 {report.total} 条，新增 {report.added} 个，词库已有{" "}
                  {report.skippedExisting} 个（内容未改动）。
                </>
              ) : (
                <>
                  导入「{report.file}」到{DECK_NAME[report.deck ?? "toefl"]}词库：读取 {report.total} 条，新增 {report.added}，原始内容有变化 {report.updated}，未变{" "}
                  {report.unchanged}。
                </>
              )}
              {report.deckAddedWords.length > 0 && (
                <div data-testid="deck-added">
                  其中 {report.deckAddedWords.length} 个已有的词同时加入了{DECK_NAME[report.deck ?? "toefl"]}词库：{report.deckAddedWords.slice(0, 20).join("、")}
                  {report.deckAddedWords.length > 20 && " 等"}
                </div>
              )}
              {report.duplicatesInFile.length > 0 && <> 文件内重复 {report.duplicatesInFile.length} 条已跳过。</>}
              {report.spellingFlags > 0 && <> 有 {report.spellingFlags} 个词条疑似拼写错误，请在「疑似拼写」里确认。</>}
              {report.added > 0 && state.imports.length > 1 && (
                <div data-testid="added-words">
                  新增：{report.addedWords.slice(0, 30).join("、")}
                  {report.addedWords.length > 30 && ` 等 ${report.addedWords.length} 个`}
                  <button type="button" className="btn-plain" onClick={onShowRecent}>
                    只看新增
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
