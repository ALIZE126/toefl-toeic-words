import { useEffect, useRef, useState } from "react";
import type { Entry, Example, ListenResult, Sense, Settings, ContextResult } from "../types";
import type { Choice } from "../lib/questions";
import { speak, stopSpeaking } from "../lib/speech";
import { displayWord } from "../lib/library";
import { ChoiceList, Highlight, PhoneticLine } from "./common";
import { RESULT_LABEL } from "../lib/scheduler";

export interface ListeningDone {
  result: ListenResult | ContextResult;
  plays: number;
  audioFallback?: boolean;
}

interface Props {
  entry: Entry;
  sense: Sense;
  example: Example;
  prompt: string;
  choices: Choice[];
  settings: Settings;
  /** 通勤模式：不选选项，听完自评 */
  commute: boolean;
  onDone: (d: ListeningDone) => void;
  /** 测试时注入 */
  speakFn?: typeof speak;
}

/**
 * 无字幕听力。提交前页面上（包括 DOM 中）不出现英文句子、目标词和释义；
 * 提交后才显示字幕和解释。
 */
export default function ListeningCard({ entry, sense, example, prompt, choices, settings, commute, onDone, speakFn = speak }: Props) {
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<ListenResult | ContextResult | null>(null);
  const revealed = result !== null;
  const autoTried = useRef(false);

  const play = async (slow = false, auto = false) => {
    setPlaying(true);
    const r = await speakFn(example.text, { rate: slow ? 0.7 : settings.rate, voiceURI: settings.voiceURI });
    setPlaying(false);
    if (r.ok) {
      setError(null);
      if (!revealed) setPlays((p) => p + 1);
    } else if (!auto) {
      setError(r.reason);
    }
  };

  useEffect(() => {
    // 已有用户操作时尝试自动播放第一遍；失败不提示，等用户点播放
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!autoTried.current && ua?.hasBeenActive) {
      autoTried.current = true;
      void play(false, true);
    }
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitChoice = () => {
    if (chosen === null) return;
    const ok = choices[chosen]?.correct;
    if (fallback) setResult(ok ? "correct" : "wrong");
    else setResult(ok ? (plays <= 1 ? "first" : "replay") : "subtitle");
  };

  const word = displayWord(entry);
  const resultTone = result === "first" || result === "correct" ? "good" : result === "replay" ? "warn" : "bad";

  return (
    <div className="card listening" data-testid="listening-card">
      <div className="card-kind">🎧 无字幕听力{fallback && "（语音不可用，已改为文字题）"}</div>

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
          <div className="hint">Mac 上建议使用 Safari 或 Chrome，并确认「系统设置 → 辅助功能 → 朗读内容」中有英文语音。</div>
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
                改做文字题
              </button>
            </div>
          )}
        </div>
      )}

      {fallback && !revealed && (
        <p className="sentence big">
          <Highlight text={example.text} word={word} />
        </p>
      )}

      <p className="question">{prompt}</p>

      {!commute || fallback ? (
        <>
          <ChoiceList choices={choices} chosen={chosen} revealed={revealed} onChoose={setChosen} />
          {!revealed && (
            <div className="actions">
              {!fallback && (
                <button type="button" className="btn" onClick={() => setResult("subtitle")}>
                  没听懂，看字幕
                </button>
              )}
              <button type="button" className="btn primary" disabled={chosen === null || (!fallback && plays === 0)} onClick={submitChoice}>
                提交
              </button>
            </div>
          )}
          {!revealed && !fallback && plays === 0 && <div className="hint">先播放，听完再作答</div>}
        </>
      ) : (
        !revealed && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => setResult("subtitle")}>
              没听懂，看字幕
            </button>
            <button type="button" className="btn primary" disabled={plays === 0} onClick={() => setResult(plays <= 1 ? "first" : "replay")}>
              听懂了
            </button>
          </div>
        )
      )}

      {revealed && result && (
        <div className="reveal" data-testid="listening-reveal">
          <div className={`result ${resultTone}`}>{fallback ? `文字题${RESULT_LABEL[result]}（不计入听力成绩）` : RESULT_LABEL[result]}</div>
          {commute && !fallback && result !== "subtitle" && (
            <button type="button" className="link" onClick={() => setResult("subtitle")}>
              看了字幕发现没听懂？改为「看字幕才懂」
            </button>
          )}
          <p className="sentence big">
            <Highlight text={example.text} word={word} />
          </p>
          {example.zh && <p className="zh">{example.zh}</p>}
          <div className="word-line">
            <strong>{word}</strong> <PhoneticLine entry={entry} />
          </div>
          <div className="gloss">
            {sense.pos} {sense.gloss}
          </div>
          {!fallback && (
            <button type="button" className="btn ghost small" onClick={() => play()}>
              🔊 对着字幕再听
            </button>
          )}
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => onDone({ result, plays, audioFallback: fallback })}>
              下一题 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
