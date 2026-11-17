import type { ContextResult, Entry, Example, Sense, Settings } from "../types";
import type { Choice } from "../lib/questions";
import { displayWord } from "../lib/library";
import { ChoiceList, Highlight, PhoneticLine, ResultLine, SpeakButton } from "./common";
import { ActionBar, useCardState } from "./session";

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
  const [chosen, setChosen] = useCardState<number | null>("chosen", null);
  const [result, setResult] = useCardState<ContextResult | null>("result", null);
  const [shown, setShown] = useCardState("shown", false);
  const word = displayWord(entry);
  const revealed = result !== null || shown;
  const others = entry.senses.filter((s) => s.id !== sense.id && s.gloss);

  return (
    <div className="study context">
      <span className="pill">新句理解</span>
      <p className="sentence big">
        <Highlight text={example.text} word={word} />
      </p>
      <SpeakButton text={example.text} settings={settings} label="朗读句子" />
      <p className="question">
        这句话里的 <mark>{word}</mark> 是什么意思？
      </p>
      {!commute && <ChoiceList choices={choices} chosen={chosen} revealed={result !== null} onChoose={setChosen} />}

      {revealed && (
        <div className="answer">
          {result && <ResultLine tone={result === "correct" ? "good" : "bad"}>{result === "correct" ? "答对了" : "答错了"}</ResultLine>}
          <div className="word-line">
            <strong>{word}</strong> <PhoneticLine entry={entry} />
          </div>
          <p>
            本句义项：{sense.pos} {sense.gloss}
          </p>
          {example.zh && <p className="muted">{example.zh}</p>}
          {others.length > 0 && (
            <details>
              <summary>其他义项</summary>
              <p className="muted small">{others.map((s) => `${s.pos} ${s.gloss}`).join(" ｜ ")}</p>
            </details>
          )}
        </div>
      )}

      <ActionBar className={commute && shown && !result ? "two" : ""}>
        {!commute && result === null && (
          <button type="button" className="btn-primary" disabled={chosen === null} onClick={() => setResult(choices[chosen!]?.correct ? "correct" : "wrong")}>
            提交
          </button>
        )}
        {commute && !shown && (
          <button type="button" className="btn-primary" onClick={() => setShown(true)}>
            心里想好了，显示答案
          </button>
        )}
        {commute && shown && !result && (
          <>
            <button type="button" className="btn-grade bad" onClick={() => onDone("wrong")}>
              我想错了
            </button>
            <button type="button" className="btn-grade good" onClick={() => onDone("correct")}>
              我想对了
            </button>
          </>
        )}
        {result !== null && (
          <button type="button" className="btn-primary" onClick={() => onDone(result)}>
            下一题 →
          </button>
        )}
      </ActionBar>
    </div>
  );
}
