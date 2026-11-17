import type { Entry, Sense, Settings, TextResult } from "../types";
import { displayWord, learnExample } from "../lib/library";
import { Highlight, PhoneticLine, SpeakButton } from "./common";
import PackImage from "./PackImage";
import { ActionBar, useCardState } from "./session";

interface Props {
  entry: Entry;
  sense: Sense;
  settings: Settings;
  intro?: boolean;
  onDone: (r: TextResult) => void;
}

/** 文字回忆：看单词想意思 → 显示答案 → 自评 */
export default function TextCard({ entry, sense, settings, intro, onDone }: Props) {
  const [shown, setShown] = useCardState("shown", false);
  const word = displayWord(entry);
  const multi = entry.senses.filter((s) => s.gloss).length > 1;
  const idx = entry.senses.findIndex((s) => s.id === sense.id) + 1;
  const ex = learnExample(sense);

  return (
    <div className="study text">
      <span className="pill">文字回忆{intro && " · 初学回忆"}</span>
      <div className="headword">
        <h3 className="word big">{word}</h3>
        <SpeakButton text={word} settings={settings} />
      </div>
      <PhoneticLine entry={entry} />
      {multi && (
        <p className="muted small">
          义项 {idx} / {entry.senses.length} {sense.pos}
          {sense.cue && (
            <>
              {" · "}语境：<em>{sense.cue}</em>
            </>
          )}
        </p>
      )}
      {!shown && <p className="muted small">先在心里说出它的意思，再显示答案。</p>}
      {shown && (
        <div className="answer">
          <h3>
            {sense.pos} {sense.gloss}
          </h3>
          {sense.part1?.image && <PackImage image={sense.part1.image} alt={`${word} 配图`} className="photo" zoomable />}
          {ex && (
            <>
              <p className="sentence">
                <Highlight text={ex.text} word={word} />
              </p>
              {ex.zh && <p className="muted">{ex.zh}</p>}
            </>
          )}
          {entry.collocations.length > 0 && (
            <details>
              <summary>搭配</summary>
              <p className="muted small">{entry.collocations.join(" ｜ ")}</p>
            </details>
          )}
        </div>
      )}
      <ActionBar className={shown ? "three" : ""}>
        {!shown ? (
          <button type="button" className="btn-primary" onClick={() => setShown(true)}>
            显示答案
          </button>
        ) : (
          <>
            <button type="button" className="btn-grade bad" onClick={() => onDone("again")}>
              没想起来
            </button>
            <button type="button" className="btn-grade warn" onClick={() => onDone("hard")}>
              有点模糊
            </button>
            <button type="button" className="btn-grade good" onClick={() => onDone("good")}>
              想起来了
            </button>
          </>
        )}
      </ActionBar>
    </div>
  );
}
