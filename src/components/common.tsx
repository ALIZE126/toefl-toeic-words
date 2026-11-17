import { useState, type ReactNode } from "react";
import Icon from "./Icon";
import { splitHighlight } from "../lib/util";
import { speak, speechOptions } from "../lib/speech";
import type { Choice } from "../lib/questions";
import type { Entry, Settings } from "../types";
import { parsePhonetic } from "../lib/meaning";

export function Highlight({ text, word }: { text: string; word: string }) {
  return (
    <>
      {splitHighlight(text, word).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/** 朗读按钮（学习句、单词发音等文字可见的场景） */
export function SpeakButton({ text, settings, label, slow }: { text: string; settings: Settings; label?: ReactNode; slow?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="speak-wrap">
      <button
        type="button"
        className={label ? "btn-plain" : "icon-btn"}
        aria-label={`朗读：${text}`}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          const r = await speak(text, speechOptions(settings, slow));
          setBusy(false);
          setErr(r.ok ? null : r.reason);
        }}
      >
        {label ?? <Icon name="volume" />}
      </button>
      {err && <span className="hint error-text">{err}</span>}
    </span>
  );
}

export function PhoneticLine({ entry }: { entry: Entry }) {
  const p = parsePhonetic(entry.phonetic);
  if (!p.uk && !p.us) return entry.phonetic ? <div className="phonetic">{entry.phonetic}</div> : null;
  return (
    <div className="phonetic">
      {p.uk && <span>英 {p.uk}</span>}
      {p.us && <span>美 {p.us}</span>}
    </div>
  );
}

export function ChoiceList({
  choices,
  chosen,
  revealed,
  onChoose,
}: {
  choices: Choice[];
  chosen: number | null;
  revealed: boolean;
  onChoose: (i: number) => void;
}) {
  return (
    <div className="choices" role="radiogroup">
      {choices.map((c, i) => {
        let cls = "choice";
        if (revealed && c.correct) cls += " right";
        else if (revealed && chosen === i) cls += " wrong";
        else if (chosen === i) cls += " selected";
        return (
          <button key={i} type="button" role="radio" aria-checked={chosen === i} className={cls} disabled={revealed} onClick={() => onChoose(i)}>
            <span className="choice-key">{String.fromCharCode(65 + i)}</span>
            {c.text}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" | "bad" | "info" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/**
 * 音频控件：主按钮播放（播放中显示状态），下方「重听 / 慢速」，状态用文字播报。
 */
export function AudioPanel({
  plays,
  playing,
  onPlay,
  disabled,
  label = "播放句子",
}: {
  plays: number;
  playing: boolean;
  onPlay: (slow?: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="audio">
      <button type="button" className="btn-primary play" onClick={() => onPlay()} disabled={playing || disabled} aria-label="播放句子">
        <Icon name="volume" />
        <span>{playing ? "正在播放…" : plays === 0 ? label : "再播放一遍"}</span>
      </button>
      <div className="audio-options">
        <button type="button" className="btn-plain" onClick={() => onPlay()} disabled={playing || disabled || plays === 0}>
          重听
        </button>
        <button type="button" className="btn-plain" onClick={() => onPlay(true)} disabled={playing || disabled}>
          慢速
        </button>
      </div>
      <p className="notice" aria-live="polite">
        {playing ? "正在播放" : plays > 0 ? `已听 ${plays} 次` : "还没有播放"}
      </p>
    </div>
  );
}

/** 作答结果：同时用文字和颜色表示 */
export function ResultLine({ tone, children }: { tone: "good" | "warn" | "bad"; children: ReactNode }) {
  return (
    <div className={`result ${tone}`} role="status">
      <span aria-hidden="true">{tone === "good" ? "✓" : tone === "warn" ? "≈" : "✗"}</span> {children}
    </div>
  );
}
