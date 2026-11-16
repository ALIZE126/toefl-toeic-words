import { useState } from "react";
import type { AppState, Entry, Example, Sense, TrackKind } from "../types";
import type { Update } from "../store";
import { displayWord, newExampleId, newSenseId, removeSense, senseReady, updateEntry } from "../lib/library";
import { KIND_LABEL, KIND_ORDER, STATUS_LABEL, trackKey, trackStatus } from "../lib/scheduler";
import { PhoneticLine, Pill, SpeakButton } from "./common";

interface Props {
  entry: Entry;
  state: AppState;
  update: Update;
  today: string;
  onClose: () => void;
}

export default function EntryEditor({ entry, state, update, today, onClose }: Props) {
  const patch = (p: Partial<Entry>) => update((st) => updateEntry(st, entry.id, p));
  const patchSense = (sid: string, p: Partial<Sense>) =>
    update((st) => {
      const e = st.entries[entry.id];
      return updateEntry(st, entry.id, { senses: e.senses.map((s) => (s.id === sid ? { ...s, ...p, origin: s.origin === "auto" ? "user" : s.origin } : s)) });
    });
  const word = displayWord(entry);
  const [fix, setFix] = useState(entry.correctedWord ?? entry.spelling?.suggestion ?? "");

  return (
    <section className="stack">
      <div className="panel">
        <button className="btn ghost small" onClick={onClose}>
          ← 返回词库
        </button>
        <div className="headword">
          {word}
          <SpeakButton text={word} settings={state.settings} />
        </div>
        <PhoneticLine entry={entry} />
        <div className="raw">
          <div>
            <span className="hint">词本原文（只读）：</span>
            {entry.word} ｜ {entry.phonetic || "（无音标）"} ｜ {entry.meaning}
          </div>
          <div className="hint">
            来源：{entry.source.file} 第 {entry.source.row} 行 · 首次导入 {entry.source.firstImportedAt.slice(0, 10)}
          </div>
        </div>

        {entry.spelling && entry.spelling.status !== "dismissed" && (
          <div className={`banner ${entry.spelling.status === "confirmed" ? "good" : "warn"}`}>
            {entry.spelling.status === "pending" ? (
              <>
                <div>⚠️ {entry.spelling.reason}</div>
                <div className="row">
                  <input value={fix} placeholder="正确写法" onChange={(e) => setFix(e.target.value)} />
                  <button
                    className="btn primary small"
                    disabled={!fix.trim()}
                    onClick={() => patch({ correctedWord: fix.trim(), spelling: { ...entry.spelling!, status: "confirmed" } })}
                  >
                    确认改为「{fix.trim() || "…"}」
                  </button>
                  <button className="btn small" onClick={() => patch({ spelling: { ...entry.spelling!, status: "dismissed" } })}>
                    拼写没问题
                  </button>
                </div>
              </>
            ) : (
              <div className="row">
                已确认拼写更正：{entry.word} → <b>{entry.correctedWord}</b>（词本原文保留不变）
                <button className="btn ghost small" onClick={() => patch({ correctedWord: undefined, spelling: { ...entry.spelling!, status: "pending" } })}>
                  撤销
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>学习义项</h3>
        <p className="hint">多义词请按义项拆开，分别练习。每个义项需要 1 个学习句；再加 1 个不同的复测句，就能做无字幕听力和新句理解。</p>
        {entry.senses.map((s, i) => (
          <SenseEditor
            key={s.id}
            index={i}
            sense={s}
            entry={entry}
            state={state}
            today={today}
            onPatch={(p) => patchSense(s.id, p)}
            onRemove={() => {
              if (confirm(`删除义项「${s.gloss || i + 1}」？它的复习进度会一起删除。`)) update((st) => removeSense(st, entry.id, s.id));
            }}
          />
        ))}
        <button
          className="btn"
          onClick={() => patch({ senses: [...entry.senses, { id: newSenseId(entry), pos: "", gloss: "", examples: [], origin: "user" }] })}
        >
          ＋ 添加义项
        </button>
      </div>

      <div className="panel">
        <h3>搭配与来源</h3>
        <label className="field">
          <span>常用搭配（每行一个）</span>
          <textarea
            rows={3}
            value={entry.collocations.join("\n")}
            onChange={(e) => patch({ collocations: e.target.value.split("\n") })}
            onBlur={(e) => patch({ collocations: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
          />
        </label>
        <label className="field">
          <span>题目来源（如：TPO 54 听力 Lecture 2 / 托业 Part 3）</span>
          <input value={entry.questionSource} onChange={(e) => patch({ questionSource: e.target.value })} />
        </label>
        <label className="field">
          <span>备注</span>
          <textarea rows={2} value={entry.note} onChange={(e) => patch({ note: e.target.value })} />
        </label>
      </div>
    </section>
  );
}

function SenseEditor({
  index,
  sense,
  entry,
  state,
  today,
  onPatch,
  onRemove,
}: {
  index: number;
  sense: Sense;
  entry: Entry;
  state: AppState;
  today: string;
  onPatch: (p: Partial<Sense>) => void;
  onRemove: () => void;
}) {
  const ready = senseReady(sense);
  const setEx = (id: string, p: Partial<Example>) => onPatch({ examples: sense.examples.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addEx = (role: Example["role"]) =>
    onPatch({ examples: [...sense.examples, { id: newExampleId(sense.id), text: "", role, kind: "self" }] });

  return (
    <div className="sense">
      <div className="sense-head">
        <b>义项 {index + 1}</b>
        {sense.origin === "curated" && <Pill tone="info">内置练习</Pill>}
        {!ready.learn && <Pill tone="warn">缺学习句</Pill>}
        {ready.learn && !ready.test && <Pill tone="warn">缺复测句（只能文字回忆）</Pill>}
        {KIND_ORDER.map((k: TrackKind) => {
          const t = state.tracks[trackKey(sense.id, k)];
          const st = trackStatus(t, today);
          if (st === "none") return null;
          const tone = st === "mastered" ? "good" : st === "due" ? "warn" : "plain";
          return (
            <Pill key={k} tone={tone}>
              {KIND_LABEL[k]}：{STATUS_LABEL[st]}
              {st === "learning" && t?.due ? `（${t.due.slice(5)}）` : ""}
            </Pill>
          );
        })}
        <button className="btn ghost small danger-text" onClick={onRemove} disabled={entry.senses.length <= 1}>
          删除
        </button>
      </div>
      <div className="grid2">
        <label className="field narrow">
          <span>词性</span>
          <input value={sense.pos} onChange={(e) => onPatch({ pos: e.target.value })} />
        </label>
        <label className="field">
          <span>学习用中文义项</span>
          <input value={sense.gloss} onChange={(e) => onPatch({ gloss: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>语境提示（多义词在文字回忆时显示，如 company property）</span>
        <input value={sense.cue ?? ""} onChange={(e) => onPatch({ cue: e.target.value || undefined })} />
      </label>

      {sense.examples.map((x) => (
        <div className="example" key={x.id}>
          <div className="row">
            <select value={x.role} onChange={(e) => setEx(x.id, { role: e.target.value as Example["role"] })}>
              <option value="learn">学习句</option>
              <option value="test">复测句（听力 / 新句）</option>
            </select>
            <select value={x.kind} onChange={(e) => setEx(x.id, { kind: e.target.value as Example["kind"] })}>
              <option value="self">自编例句</option>
              <option value="original">原题例句</option>
            </select>
            {x.kind === "original" && (
              <input placeholder="出处，如 TPO 54 L2" value={x.source ?? ""} onChange={(e) => setEx(x.id, { source: e.target.value })} />
            )}
            <button
              className="btn ghost small danger-text"
              onClick={() => onPatch({ examples: sense.examples.filter((y) => y.id !== x.id) })}
              aria-label="删除例句"
            >
              ✕
            </button>
          </div>
          <input className="en" placeholder="英文句子" value={x.text} onChange={(e) => setEx(x.id, { text: e.target.value })} />
          <input placeholder="中文翻译（可选）" value={x.zh ?? ""} onChange={(e) => setEx(x.id, { zh: e.target.value })} />
          {x.role === "test" && (
            <details className="hint">
              <summary>听力理解题{x.listenQ ? `：${x.listenQ.prompt}` : "（未设置，将问「关键词是什么意思」）"}</summary>
              <ListenQEditor ex={x} onChange={(q) => setEx(x.id, { listenQ: q })} />
            </details>
          )}
        </div>
      ))}
      <div className="row">
        <button className="btn small" onClick={() => addEx("learn")}>
          ＋ 学习句
        </button>
        <button className="btn small" onClick={() => addEx("test")}>
          ＋ 复测句
        </button>
      </div>
    </div>
  );
}

function ListenQEditor({ ex, onChange }: { ex: Example; onChange: (q: Example["listenQ"]) => void }) {
  const q = ex.listenQ ?? { prompt: "", options: ["", "", "", ""], answer: 0 };
  const set = (p: Partial<NonNullable<Example["listenQ"]>>) => {
    const next = { ...q, ...p };
    onChange(next.prompt.trim() || next.options.some((o) => o.trim()) ? next : undefined);
  };
  return (
    <div className="stack tight">
      <input placeholder="中文提问（不要写出目标词），如：客户会议要怎么处理？" value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      {q.options.map((o, i) => (
        <label key={i} className="row">
          <input type="radio" checked={q.answer === i} onChange={() => set({ answer: i })} aria-label={`选项 ${i + 1} 为正确答案`} />
          <input
            placeholder={i === 0 ? "选项（选中左侧圆点表示正确答案）" : "选项"}
            value={o}
            onChange={(e) => set({ options: q.options.map((y, j) => (j === i ? e.target.value : y)) })}
          />
        </label>
      ))}
    </div>
  );
}
