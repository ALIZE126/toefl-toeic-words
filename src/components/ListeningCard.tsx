import { useEffect, useRef, useState } from "react";
import type { Entry, Example, ListenResult, Sense, Settings, ContextResult } from "../types";
import type { Choice } from "../lib/questions";
import { speak, speechOptions, stopSpeaking } from "../lib/speech";
import { displayWord } from "../lib/library";
import { AudioPanel, ChoiceList, Highlight, PhoneticLine, ResultLine } from "./common";
import { RESULT_LABEL } from "../lib/scheduler";
import { ActionBar, useCardState } from "./session";

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
  const [plays, setPlays] = useCardState("plays", 0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useCardState("fallback", false);
  const [chosen, setChosen] = useCardState<number | null>("chosen", null);
  const [result, setResult] = useCardState<ListenResult | ContextResult | null>("result", null);
  const revealed = result !== null;
  const autoTried = useRef(false);

  const play = async (slow = false, auto = false) => {
    setPlaying(true);
    const r = await speakFn(example.text, speechOptions(settings, slow));
    setPlaying(false);
    if (r.ok) {
      setError(null);
      if (!revealed) setPlays((p) => p + 1);
    } else if (!auto) {
      setError(r.reason);
    }
  };

  useEffect(() => {
    // 已有用户操作、且还没听过时尝试自动播放第一遍；失败不提示，等用户点播放
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (!autoTried.current && ua?.hasBeenActive && plays === 0 && !revealed) {
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
    <div className="study listening" data-testid="listening-card">
      <span className="pill">无字幕听力{fallback && " · 语音不可用，已改为文字题"}</span>

      {!fallback && <AudioPanel plays={plays} playing={playing} onPlay={(slow) => play(slow)} />}

      {error && !fallback && (
        <div className="banner error" role="alert">
          <div>无法播放语音：{error}</div>
          <div className="muted small">Mac 上建议使用 Safari 或 Chrome，并确认「系统设置 → 辅助功能 → 朗读内容」中有英文语音。</div>
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

      {(!commute || fallback) && <ChoiceList choices={choices} chosen={chosen} revealed={revealed} onChoose={setChosen} />}
      {!revealed && !fallback && plays === 0 && <p className="muted small">先播放，听完再作答</p>}

      {revealed && result && (
        <div className="answer" data-testid="listening-reveal">
          <ResultLine tone={resultTone}>{fallback ? `文字题${RESULT_LABEL[result]}（不计入听力成绩）` : RESULT_LABEL[result]}</ResultLine>
          {commute && !fallback && result !== "subtitle" && (
            <button type="button" className="btn-plain" onClick={() => setResult("subtitle")}>
              看了字幕发现没听懂？改为「看字幕才懂」
            </button>
          )}
          <p className="sentence big">
            <Highlight text={example.text} word={word} />
          </p>
          {example.zh && <p className="muted">{example.zh}</p>}
          <div className="word-line">
            <strong>{word}</strong> <PhoneticLine entry={entry} />
          </div>
          <p>
            {sense.pos} {sense.gloss}
          </p>
          {!fallback && (
            <button type="button" className="btn-plain" onClick={() => play()}>
              对着字幕再听
            </button>
          )}
        </div>
      )}

      <ActionBar className={!revealed ? "two" : ""}>
        {!revealed && (!commute || fallback) && (
          <>
            {!fallback && (
              <button type="button" className="btn-secondary" onClick={() => setResult("subtitle")}>
                没听懂，看字幕
              </button>
            )}
            <button type="button" className="btn-primary" disabled={chosen === null || (!fallback && plays === 0)} onClick={submitChoice}>
              提交
            </button>
          </>
        )}
        {!revealed && commute && !fallback && (
          <>
            <button type="button" className="btn-secondary" onClick={() => setResult("subtitle")}>
              没听懂，看字幕
            </button>
            <button type="button" className="btn-primary" disabled={plays === 0} onClick={() => setResult(plays <= 1 ? "first" : "replay")}>
              听懂了
            </button>
          </>
        )}
        {revealed && result && (
          <button type="button" className="btn-primary" onClick={() => onDone({ result, plays, audioFallback: fallback })}>
            下一题 →
          </button>
        )}
      </ActionBar>
    </div>
  );
}
