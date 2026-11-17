import { useEffect, useRef, useState } from "react";
import type { Part1Result, Settings } from "../types";
import type { ResolvedQuestion } from "../lib/part1";
import { speak, speechOptions, stopSpeaking } from "../lib/speech";
import { getImageUrl } from "../lib/imageStore";
import PackImage, { requestRelink } from "./PackImage";
import { AudioPanel, ResultLine } from "./common";
import { ActionBar, useCardState } from "./session";

export interface Part1Done {
  result: Part1Result;
  plays: number;
  /** 答错时选中的图片对应的 phrase_id */
  chosen?: string;
  audioFallback?: boolean;
}

interface Props {
  question: ResolvedQuestion;
  settings: Settings;
  onDone: (d: Part1Done) => void;
  /** 图片不可用时跳过：不记录作答，这道题保持待练 */
  onSkip?: () => void;
  speakFn?: typeof speak;
  /** 测试时固定图片顺序 */
  shuffle?: <T>(xs: T[]) => T[];
}

function randomShuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETTERS = "ABCDEF";

type Ready = "checking" | "ok" | { missing: number; error?: string };

/**
 * 托业 Part 1 听音选图。提交前页面上（包括 DOM、图片 alt）没有播报句、目标短语、答案和画面线索；
 * 图片每次随机排列（顺序保存在会话里，刷新后不变）。提交后显示原句和每张图的判断依据。
 * 作答前先确认所需图片都能读到；读不到时不让作答，可以跳过（这道题保持待练）。
 */
export default function Part1Card({ question, settings, onDone, onSkip, speakFn = speak, shuffle = randomShuffle }: Props) {
  const [order] = useCardState<number[]>("order", () => {
    const opts = question.options;
    return (question.randomize ? shuffle(opts) : opts).map((o) => opts.indexOf(o));
  }, { persist: true });
  const options = order.map((i) => question.options[i]).filter(Boolean);
  const [plays, setPlays] = useCardState("plays", 0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useCardState("fallback", false);
  const [chosen, setChosen] = useCardState<number | null>("chosen", null);
  const [result, setResult] = useCardState<Part1Result | null>("result", null);
  const [ready, setReady] = useState<Ready>("checking");
  const [check, setCheck] = useState(0);
  const autoTried = useRef(false);
  const revealed = result !== null;

  useEffect(() => {
    let alive = true;
    setReady("checking");
    Promise.all(question.options.map((o) => getImageUrl(o.image.sha256)))
      .then((urls) => {
        if (!alive) return;
        const missing = urls.filter((u) => !u).length;
        setReady(missing ? { missing } : "ok");
      })
      .catch((e) => alive && setReady({ missing: 0, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [question, check]);

  const play = async (slow = false, auto = false) => {
    setPlaying(true);
    const r = await speakFn(question.audioText, speechOptions(settings, slow));
    setPlaying(false);
    if (r.ok) {
      setError(null);
      if (!revealed) setPlays((p) => p + 1);
    } else if (!auto) setError(r.reason);
  };

  useEffect(() => {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!autoTried.current && ua?.hasBeenActive && plays === 0 && !revealed) {
      autoTried.current = true;
      void play(false, true);
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (chosen === null) return;
    const ok = options[chosen].phraseId === question.correctPhraseId;
    setResult(ok ? (fallback || plays <= 1 ? "first" : "replay") : "wrong");
  };

  const label = (r: Part1Result) => (r === "first" ? "首听答对" : r === "replay" ? "重听后答对" : "答错");
  const tone = result === "first" ? "good" : result === "replay" ? "warn" : "bad";
  const blocked = !revealed && ready !== "ok" && ready !== "checking";

  return (
    <div className="study part1" data-testid="part1-card">
      <span className="pill">
        托业 Part 1 · 听音选图{question.practice && " · 练习题（不计入复习）"}
        {fallback && " · 语音不可用，已改为看句选图"}
      </span>

      {blocked && (
        <div className="banner error" role="alert">
          <div>
            {typeof ready === "object" && ready.error
              ? `图片读取失败：${ready.error}`
              : `这道题有 ${typeof ready === "object" ? ready.missing : 0} 张图片不在这台设备的浏览器里，暂时不能作答。`}
          </div>
          <div className="row wrap">
            <button type="button" className="btn-secondary" onClick={() => setCheck((n) => n + 1)}>
              重试
            </button>
            <button type="button" className="btn-secondary" onClick={requestRelink}>
              重新关联图片包
            </button>
          </div>
        </div>
      )}

      {!fallback && !blocked && <AudioPanel plays={plays} playing={playing} onPlay={(slow) => play(slow)} />}

      {error && !fallback && (
        <div className="banner error" role="alert">
          <div>无法播放语音：{error}</div>
          {!revealed && (
            <div className="row wrap">
              <button type="button" className="btn-secondary" onClick={() => play()}>
                再试一次
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setFallback(true);
                  setError(null);
                }}
              >
                改为看句选图
              </button>
            </div>
          )}
        </div>
      )}

      {(fallback || revealed) && (
        <p className="sentence big" data-testid="part1-sentence">
          {question.audioText}
        </p>
      )}
      {!revealed && !blocked && <p className="question">{fallback ? "这句话描述的是哪张图？" : "听到的这句话描述的是哪张图？"}</p>}

      <div className="p1-options" role="radiogroup" aria-label="选择图片">
        {options.map((o, i) => {
          const isRight = o.phraseId === question.correctPhraseId;
          let cls = "p1-option";
          if (revealed && isRight) cls += " right";
          else if (revealed && chosen === i) cls += " wrong";
          else if (chosen === i) cls += " selected";
          return (
            <div key={i} className={cls}>
              <button
                type="button"
                role="radio"
                aria-checked={chosen === i}
                aria-label={`图片 ${LETTERS[i]}`}
                className="p1-pick"
                disabled={revealed || blocked}
                onClick={() => setChosen(i)}
              >
                <PackImage image={o.image} alt={`图片 ${LETTERS[i]}`} />
                <span className="p1-letter">{LETTERS[i]}</span>
              </button>
              {revealed && (
                <div className="p1-why">
                  <div>
                    {isRight ? "✓ 正确" : chosen === i ? "✗ 你选的" : "对照图"} · <b>{o.entry.word}</b> {o.sense.gloss}
                  </div>
                  {o.image.cue && <div>判断依据：{o.image.cue}</div>}
                  {o.image.caution && <div className="muted">注意：{o.image.caution}</div>}
                  {o.image.sceneEn && <div className="muted">这张图：{o.image.sceneEn}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!revealed && !fallback && !blocked && plays === 0 && <p className="muted small">先播放，听完再选图</p>}

      {revealed && (
        <div className="answer" data-testid="part1-reveal">
          <ResultLine tone={tone}>
            {label(result!)}
            {fallback && "（看句选图，不计入听音成绩）"}
          </ResultLine>
          {question.practice && <p className="muted small">这是自动出的练习题，干扰图没有逐题审核。如果两张图都说得通，以原句和判断依据为准。</p>}
          {!fallback && (
            <button type="button" className="btn-plain" onClick={() => play()}>
              对着原句再听
            </button>
          )}
        </div>
      )}

      <ActionBar className={!revealed && !blocked && !fallback ? "two" : ""}>
        {blocked ? (
          onSkip && (
            <button type="button" className="btn-primary" onClick={onSkip}>
              跳过，稍后再练
            </button>
          )
        ) : !revealed ? (
          <>
            {!fallback && (
              <button type="button" className="btn-secondary" onClick={() => setResult("wrong")}>
                没听出来，看答案
              </button>
            )}
            <button type="button" className="btn-primary" disabled={chosen === null || (!fallback && plays === 0)} onClick={submit}>
              提交
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              onDone({
                result: result!,
                plays,
                chosen: result === "wrong" && chosen !== null ? options[chosen].phraseId : undefined,
                audioFallback: fallback || undefined,
              })
            }
          >
            下一题 →
          </button>
        )}
      </ActionBar>
    </div>
  );
}
