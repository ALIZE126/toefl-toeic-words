import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "../types";
import type { Update } from "../store";
import { PASSAGES, type Passage } from "../data/passages";
import { gradePassage, passageSummary, preparePassage, recordPassage, resolveTarget, type BlankResult } from "../lib/reading";
import BlankInput from "../components/BlankInput";
import { Pill, ResultLine } from "../components/common";
import { FocusLayout, useNav } from "../components/nav";
import { ActionBar } from "../components/session";
import Icon from "../components/Icon";

/** 专项 → 托福补词：短文列表 */
export default function ReadingPage({ state }: { state: AppState }) {
  const nav = useNav();
  return (
    <section className="page">
      <button type="button" className="back" onClick={() => nav.go({ tab: "training" })}>
        <Icon name="chevron-left" />
        专项
      </button>
      <h2>托福补词</h2>
      <p className="muted small">
        模拟新版 TOEFL iBT Reading 的 Complete the Words：首句完整保留，之后每隔一个词去掉后半部分，共 10 空。只需输入缺少的字母，整篇提交后统一判分。拼错的生词本词会进入拼写复习，下次换一句再考。
      </p>
      {PASSAGES.map((p) => {
        const sum = passageSummary(state, p.id);
        const draft = state.readingDrafts?.[p.id]?.filter((x) => x.trim()).length ?? 0;
        return (
          <button key={p.id} type="button" className="topic passage-item" onClick={() => nav.go({ tab: "training", sub: "toefl", passage: p.id })}>
            <span className="row spread">
              <h3>{p.title}</h3>
              <Icon name="chevron-right" />
            </span>
            <span className="muted small">
              {draft
                ? `未提交：已填 ${draft} 空，点开继续`
                : sum
                  ? `已做 ${sum.attempts} 次 · 上次 ${sum.last.score}/${sum.last.total} · 最高 ${sum.best}/${sum.last.total}`
                  : "还没做过"}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/** 一篇短文：缺失字母输入、上一空 / 下一空、整篇提交、逐空反馈。未提交的输入保存在 readingDrafts */
export function PassagePlayer({ passage, state, update, today }: { passage: Passage; state: AppState; update: Update; today: string }) {
  const nav = useNav();
  const prep = useMemo(() => preparePassage(passage), [passage]);
  const n = prep.cloze.blanks.length;
  const [inputs, setInputs] = useState<string[]>(() => {
    const d = state.readingDrafts?.[passage.id];
    return d && d.length === n ? d : Array(n).fill("");
  });
  const [results, setResults] = useState<BlankResult[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const submitting = useRef(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const empty = inputs.filter((x) => !x.trim()).length;
  const back = () => nav.go({ tab: "training", sub: "toefl" });

  useEffect(() => setConfirmEmpty(false), [empty]);

  const saveDraft = (next: string[]) =>
    update((st) => ({ ...st, readingDrafts: { ...(st.readingDrafts ?? {}), [passage.id]: next } }));

  const focusBlank = (i: number) => {
    const el = refs.current[i];
    if (!el) return;
    el.focus();
    setCurrent(i);
  };

  const submit = () => {
    if (submitting.current || results) return;
    if (empty > 0 && !confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    submitting.current = true;
    const r = gradePassage(prep, inputs);
    update((st) => {
      const drafts = { ...(st.readingDrafts ?? {}) };
      delete drafts[passage.id];
      return { ...recordPassage(st, passage, r, today).state, readingDrafts: drafts };
    });
    setResults(r);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const retry = () => {
    submitting.current = false;
    setInputs(Array(n).fill(""));
    setResults(null);
    setCurrent(0);
  };

  const score = results?.filter((r) => r.correct).length ?? 0;
  const targetRes = results?.filter((r) => r.target) ?? [];
  const missedTargets = targetRes.filter((r) => !r.correct && resolveTarget(state, r.target!));

  return (
    <FocusLayout
      title={`托福补词 · ${passage.title}`}
      progress={{ done: results ? n : n - empty, total: n, label: results ? `${score} / ${n}` : `已填 ${n - empty} / ${n}` }}
      onBack={back}
    >
      <div className="study reading">
        {!results && <p className="muted small">在每个空里补上缺少的字母。Tab 键或「下一空」切换，手机上也可以按键盘的「下一项」。</p>}

        {results && (
          <div className="answer" role="status">
            <ResultLine tone={score === n ? "good" : score >= n / 2 ? "warn" : "bad"}>
              得分 {score} / {n}
            </ResultLine>
            <p className="muted small">
              生词本目标词 {targetRes.filter((r) => r.correct).length}/{targetRes.length}，普通词 {results.filter((r) => !r.target && r.correct).length}/
              {results.filter((r) => !r.target).length}
            </p>
            {missedTargets.length > 0 && <p>拼错的生词本词已加入拼写复习，明天在「今日」里换一句再考。</p>}
          </div>
        )}

        <p className="passage cloze" data-testid="passage">
          {prep.cloze.segments.map((seg, i) => {
            if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
            const b = seg.blank;
            const r = results?.[b.index];
            return (
              <span key={i} className={!results && current === b.index ? "blank-wrap current" : "blank-wrap"}>
                <BlankInput
                  inputRef={(el) => {
                    refs.current[b.index] = el;
                  }}
                  prefix={b.prefix}
                  length={b.answer.length}
                  value={inputs[b.index]}
                  onChange={(v) =>
                    setInputs((xs) => {
                      const next = xs.map((x, j) => (j === b.index ? v : x));
                      saveDraft(next);
                      return next;
                    })
                  }
                  onFocus={() => setCurrent(b.index)}
                  label={`第 ${b.index + 1} 空`}
                  disabled={!!results}
                  status={r ? (r.correct ? "right" : "wrong") : undefined}
                  onEnter={() => (b.index + 1 < n ? focusBlank(b.index + 1) : submit())}
                />
                {r && !r.correct && <sup className="fix">{b.answer}</sup>}
                {r && <sub className="blank-no">{b.index + 1}</sub>}
              </span>
            );
          })}
        </p>

        {results && (
          <>
            <details>
              <summary>中文大意</summary>
              <p className="muted">{passage.zh}</p>
            </details>
            <div data-testid="feedback">
              <h3>逐空反馈</h3>
              <ol className="feedback">
                {results.map((r) => {
                  const found = r.target ? resolveTarget(state, r.target) : undefined;
                  return (
                    <li key={r.blank.index} className={r.correct ? "ok" : "ng"}>
                      <div className="fb-row">
                        <span className={r.correct ? "good-text" : "bad-text"}>{r.correct ? "✓ 对" : "✗ 错"}</span>
                        <span>
                          你的输入：<code>{r.input || "（空）"}</code>
                        </span>
                        <span>
                          正确字母：<code>{r.blank.answer}</code>
                        </span>
                        <span>
                          完整单词：
                          <b>
                            {r.blank.prefix}
                            <u>{r.blank.answer}</u>
                          </b>
                        </span>
                        {r.target && <Pill tone="info">生词本</Pill>}
                      </div>
                      {r.target && (
                        <div className="note">
                          {found && (
                            <p>
                              <b>{found.entry.word}</b> {found.sense.pos} {found.sense.gloss}
                            </p>
                          )}
                          <p>{r.target.clue}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>

      <ActionBar className={!results ? "reading-bar" : "two"}>
        {!results ? (
          <>
            {confirmEmpty && (
              <p className="bar-note" role="alert">
                还有 {empty} 空没填，没填的按答错算。再点一次「提交整篇」确认。
              </p>
            )}
            <button type="button" className="btn-secondary" disabled={current <= 0} onMouseDown={(e) => e.preventDefault()} onClick={() => focusBlank(current - 1)}>
              上一空
            </button>
            <button type="button" className="btn-secondary" disabled={current >= n - 1} onMouseDown={(e) => e.preventDefault()} onClick={() => focusBlank(current + 1)}>
              下一空
            </button>
            <button type="button" className="btn-primary" onClick={submit}>
              {confirmEmpty ? `确认提交（${empty} 空未填）` : empty ? `提交整篇 · 剩 ${empty} 空` : "提交整篇"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={retry}>
              重做这篇
            </button>
            <button type="button" className="btn-primary" onClick={back}>
              返回列表
            </button>
          </>
        )}
      </ActionBar>
    </FocusLayout>
  );
}
