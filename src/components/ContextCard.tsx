import { useState } from "react";
import type { ContextResult, Entry, Example, Sense, Settings } from "../types";
import type { Choice } from "../lib/questions";
import { displayWord } from "../lib/library";
import { ChoiceList, Highlight, PhoneticLine, SpeakButton } from "./common";

interface Props {
  entry: Entry;
  sense: Sense;
  example: Example;
  choices: Choice[];
  settings: Settings;
  commute: boolean;
  onDone: (r: ContextResult) => void;
}

/** 新句理解：换一句和学习时不同的例句，判断同一个词在新语境里的意思 */
export default function ContextCard({ entry, sense, example, choices, settings, commute, onDone }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<ContextResult | null>(null);
  const [shown, setShown] = useState(false);
  const word = displayWord(entry);
  const revealed = result !== null || shown;
  const others = entry.senses.filter((s) => s.id !== sense.id && s.gloss);

  return (
    <div className="card context">
      <div className="card-kind">🧩 新句理解</div>
      <p className="sentence big">
        <Highlight text={example.text} word={word} />
      </p>
      <SpeakButton text={example.text} settings={settings} label="🔊 朗读" />
      <p className="question">
        这句话里的 <mark>{word}</mark> 是什么意思？
      </p>

      {!commute ? (
        <>
          <ChoiceList choices={choices} chosen={chosen} revealed={result !== null} onChoose={setChosen} />
          {result === null && (
            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={chosen === null}
                onClick={() => setResult(choices[chosen!]?.correct ? "correct" : "wrong")}
              >
                提交
              </button>
            </div>
          )}
        </>
      ) : (
        !shown && (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => setShown(true)}>
              心里想好了，显示答案
            </button>
          </div>
        )
      )}

      {revealed && (
        <div className="reveal">
          {result && <div className={`result ${result === "correct" ? "good" : "bad"}`}>{result === "correct" ? "答对了" : "答错了"}</div>}
          <div className="word-line">
            <strong>{word}</strong> <PhoneticLine entry={entry} />
          </div>
          <div className="gloss">
            本句义项：{sense.pos} {sense.gloss}
          </div>
          {example.zh && <p className="zh">{example.zh}</p>}
          {others.length > 0 && (
            <div className="hint">
              其他义项：{others.map((s) => `${s.pos} ${s.gloss}`).join(" ｜ ")}
            </div>
          )}
          <div className="actions">
            {commute && !result ? (
              <>
                <button type="button" className="btn danger" onClick={() => onDone("wrong")}>
                  我想错了
                </button>
                <button type="button" className="btn primary" onClick={() => onDone("correct")}>
                  我想对了
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={() => onDone(result!)}>
                下一题 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
