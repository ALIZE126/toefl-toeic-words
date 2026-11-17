import { useMemo, useRef, useState } from "react";
import type { AppState } from "../types";
import type { Update } from "../store";
import { PASSAGES, type Passage } from "../data/passages";
import { gradePassage, passageSummary, preparePassage, recordPassage, resolveTarget, type BlankResult } from "../lib/reading";
import BlankInput from "../components/BlankInput";
import { Pill } from "../components/common";

export default function ReadingPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = PASSAGES.find((p) => p.id === openId);
  if (open) return <PassagePlayer key={open.id} passage={open} state={state} update={update} today={today} onBack={() => setOpenId(null)} />;

  return (
    <section className="stack">
      <div className="panel">
        <h2>托福阅读 · 补全单词</h2>
        <p className="hint">
          模拟新版 TOEFL iBT Reading 的 Complete the Words：首句完整保留，之后每隔一个词去掉后半部分，共 10 空。只需输入缺少的字母，整篇提交后统一判分。
          每篇有几个空来自你的生词本，拼错的会加入「今日复习」的拼写复习，下次换一句再考。
        </p>
      </div>
      {PASSAGES.map((p) => {
        const sum = passageSummary(state, p.id);
        return (
          <button key={p.id} className="panel passage-item" onClick={() => setOpenId(p.id)}>
            <b>{p.title}</b>
            <span className="hint">
              {sum ? `已做 ${sum.attempts} 次 · 上次 ${sum.last.score}/${sum.last.total} · 最高 ${sum.best}/${sum.last.total}` : "还没做过"}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function PassagePlayer({
  passage,
  state,
  update,
  today,
  onBack,
}: {
  passage: Passage;
  state: AppState;
  update: Update;
  today: string;
  onBack: () => void;
}) {
  const prep = useMemo(() => preparePassage(passage), [passage]);
  const n = prep.cloze.blanks.length;
  const [inputs, setInputs] = useState<string[]>(() => Array(n).fill(""));
  const [results, setResults] = useState<BlankResult[] | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const empty = inputs.filter((x) => !x.trim()).length;

  const submit = () => {
    const r = gradePassage(prep, inputs);
    update((st) => recordPassage(st, passage, r, today).state);
    setResults(r);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const retry = () => {
    setInputs(Array(n).fill(""));
    setResults(null);
  };

  const score = results?.filter((r) => r.correct).length ?? 0;
  const targetRes = results?.filter((r) => r.target) ?? [];
  const missedTargets = targetRes.filter((r) => !r.correct && resolveTarget(state, r.target!));

  return (
    <section className="stack">
      <div className="panel">
        <button className="btn ghost small" onClick={onBack}>
          ← 返回短文列表
        </button>
        <h2>{passage.title}</h2>
        <p className="hint">在每个空里补上缺少的字母。Tab 键切换到下一空，手机上按「下一项 / 回车」。</p>

        {results && (
          <div className={`banner ${score === n ? "good" : "warn"}`} role="status">
            <div>
              <b>
                得分 {score} / {n}
              </b>
              （生词本目标词 {targetRes.filter((r) => r.correct).length}/{targetRes.length}，普通词{" "}
              {results.filter((r) => !r.target && r.correct).length}/{results.filter((r) => !r.target).length}）
            </div>
            {missedTargets.length > 0 && <div>拼错的生词本词已加入拼写复习，明天在「今日复习」里换一句再考。</div>}
          </div>
        )}

        <p className="passage cloze" data-testid="passage">
          {prep.cloze.segments.map((seg, i) => {
            if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
            const b = seg.blank;
            const r = results?.[b.index];
            return (
              <span key={i} className="blank-wrap">
                <BlankInput
                  inputRef={(el) => {
                    refs.current[b.index] = el;
                  }}
                  prefix={b.prefix}
                  length={b.answer.length}
                  value={inputs[b.index]}
                  onChange={(v) => setInputs((xs) => xs.map((x, j) => (j === b.index ? v : x)))}
                  label={`第 ${b.index + 1} 空`}
                  disabled={!!results}
                  status={r ? (r.correct ? "right" : "wrong") : undefined}
                  onEnter={() => refs.current[b.index + 1]?.focus()}
                />
                {r && !r.correct && <sup className="fix">{b.answer}</sup>}
                {r && <sub className="blank-no">{b.index + 1}</sub>}
              </span>
            );
          })}
        </p>

        {!results ? (
          <div className="actions">
            {empty > 0 && <span className="hint">还有 {empty} 空没填</span>}
            <button className="btn primary" onClick={submit}>
              提交整篇
            </button>
          </div>
        ) : (
          <>
            <p className="zh">{passage.zh}</p>
            <div className="actions">
              <button className="btn" onClick={retry}>
                重做这篇
              </button>
              <button className="btn primary" onClick={onBack}>
                返回列表
              </button>
            </div>
          </>
        )}
      </div>

      {results && (
        <div className="panel" data-testid="feedback">
          <h3>逐空反馈</h3>
          <ol className="feedback">
            {results.map((r) => {
              const found = r.target ? resolveTarget(state, r.target) : undefined;
              return (
                <li key={r.blank.index} className={r.correct ? "ok" : "ng"}>
                  <div className="fb-row">
                    <span className={r.correct ? "good-text" : "bad-text"}>{r.correct ? "✓" : "✗"}</span>
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
                    <div className="fb-clue">
                      {found && (
                        <div>
                          <b>{found.entry.word}</b> {found.sense.pos} {found.sense.gloss}
                        </div>
                      )}
                      <div>{r.target.clue}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
