import { useEffect, useRef, useState } from "react";
import type { Part1Result, Settings } from "../types";
import type { ResolvedQuestion } from "../lib/part1";
import { speak, stopSpeaking } from "../lib/speech";
import PackImage from "./PackImage";

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

/**
 * 托业 Part 1 听音选图。提交前页面上（包括 DOM、图片 alt）没有播报句、目标短语、答案和画面线索；
 * 图片每次随机排列。提交后显示原句和每张图的判断依据。
 */
export default function Part1Card({ question, settings, onDone, speakFn = speak, shuffle = randomShuffle }: Props) {
  const [order] = useState(() => (question.randomize ? shuffle(question.options) : question.options));
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<Part1Result | null>(null);
  const autoTried = useRef(false);
  const revealed = result !== null;

  const play = async (slow = false, auto = false) => {
    setPlaying(true);
    const r = await speakFn(question.audioText, { rate: slow ? 0.7 : settings.rate, voiceURI: settings.voiceURI });
    setPlaying(false);
    if (r.ok) {
      setError(null);
      if (!revealed) setPlays((p) => p + 1);
    } else if (!auto) setError(r.reason);
  };

  useEffect(() => {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!autoTried.current && ua?.hasBeenActive) {
      autoTried.current = true;
      void play(false, true);
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (chosen === null) return;
    const ok = order[chosen].phraseId === question.correctPhraseId;
    setResult(ok ? (fallback || plays <= 1 ? "first" : "replay") : "wrong");
  };

  const label = (r: Part1Result) => (r === "first" ? "首听答对" : r === "replay" ? "重听后答对" : "答错");
  const tone = result === "first" ? "good" : result === "replay" ? "warn" : "bad";

  return (
    <div className="card part1" data-testid="part1-card">
      <div className="card-kind">🖼 托业 Part 1 · 听音选图{fallback && "（语音不可用，已改为看句选图）"}</div>

      {!fallback && (
        <div className="player">
          <button type="button" className="btn play" onClick={() => play()} disabled={playing} aria-label="播放句子">
            {playing ? "播放中…" : plays === 0 ? "▶ 播放" : "↻ 重听"}
          </button>
          <button type="button" className="btn ghost" onClick={() => play(true)} disabled={playing}>
            🐢 慢速
          </button>
          <span className="hint">已听 {plays} 次</span>
        </div>
      )}

      {error && !fallback && (
        <div className="banner error" role="alert">
          <div>⚠️ 无法播放语音：{error}</div>
          {!revealed && (
            <div className="row">
              <button type="button" className="btn" onClick={() => play()}>
                再试一次
              </button>
              <button
                type="button"
                className="btn primary"
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

      {(fallback || revealed) && <p className="sentence big" data-testid="part1-sentence">{question.audioText}</p>}
      {!revealed && <p className="question">{fallback ? "这句话描述的是哪张图？" : "听到的这句话描述的是哪张图？"}</p>}

      <div className="p1-options" role="radiogroup" aria-label="选择图片">
        {order.map((o, i) => {
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
                disabled={revealed}
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
                  {o.image.caution && <div className="hint">注意：{o.image.caution}</div>}
                  {o.image.sceneEn && <div className="hint">这张图：{o.image.sceneEn}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!revealed ? (
        <>
          <div className="actions">
            {!fallback && (
              <button type="button" className="btn" onClick={() => setResult("wrong")}>
                没听出来，看答案
              </button>
            )}
            <button type="button" className="btn primary" disabled={chosen === null || (!fallback && plays === 0)} onClick={submit}>
              提交
            </button>
          </div>
          {!fallback && plays === 0 && <div className="hint">先播放，听完再选图</div>}
        </>
      ) : (
        <div className="reveal" data-testid="part1-reveal">
          <div className={`result ${tone}`}>
            {label(result!)}
            {fallback && "（看句选图，不计入听音成绩）"}
          </div>
          {!fallback && (
            <button type="button" className="btn ghost small" onClick={() => play()}>
              🔊 对着原句再听
            </button>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                onDone({
                  result: result!,
                  plays,
                  chosen: result === "wrong" && chosen !== null ? order[chosen].phraseId : undefined,
                  audioFallback: fallback || undefined,
                })
              }
            >
              下一题 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
