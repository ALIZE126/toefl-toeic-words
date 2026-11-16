import { useState } from "react";
import { splitHighlight } from "../lib/util";
import { speak } from "../lib/speech";
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
export function SpeakButton({ text, settings, label = "🔊", slow }: { text: string; settings: Settings; label?: string; slow?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="speak-wrap">
      <button
        type="button"
        className="btn ghost small"
        aria-label={`朗读：${text}`}
        onClick={async () => {
          const r = await speak(text, { rate: slow ? 0.7 : settings.rate, voiceURI: settings.voiceURI });
          setErr(r.ok ? null : r.reason);
        }}
      >
        {label}
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
