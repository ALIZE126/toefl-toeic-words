import { useState } from "react";
import type { Entry, Sense, Settings, TextResult } from "../types";
import { displayWord, learnExample } from "../lib/library";
import { Highlight, PhoneticLine, SpeakButton } from "./common";

interface Props {
  entry: Entry;
  sense: Sense;
  settings: Settings;
  intro?: boolean;
  onDone: (r: TextResult) => void;
}

/** 文字回忆：先看单词想意思，再显示答案并自评 */
export default function TextCard({ entry, sense, settings, intro, onDone }: Props) {
  const [shown, setShown] = useState(false);
  const word = displayWord(entry);
  const multi = entry.senses.filter((s) => s.gloss).length > 1;
  const idx = entry.senses.findIndex((s) => s.id === sense.id) + 1;
  const ex = learnExample(sense);

  return (
    <div className="card text">
      <div className="card-kind">📝 文字回忆{intro && "（初学回忆）"}</div>
      <div className="headword">
        {word}
        <SpeakButton text={word} settings={settings} />
      </div>
      <PhoneticLine entry={entry} />
      {multi && (
        <div className="cue">
          义项 {idx}/{entry.senses.length} {sense.pos}
          {sense.cue && (
            <>
              {" · "}语境：<em>{sense.cue}</em>
            </>
          )}
        </div>
      )}

      {!shown ? (
        <div className="actions">
          <button type="button" className="btn primary wide" onClick={() => setShown(true)}>
            显示答案
          </button>
        </div>
      ) : (
        <div className="reveal">
          <div className="gloss big">
            {sense.pos} {sense.gloss}
          </div>
          {ex && (
            <>
              <p className="sentence">
                <Highlight text={ex.text} word={word} />
              </p>
              {ex.zh && <p className="zh">{ex.zh}</p>}
            </>
          )}
          {entry.collocations.length > 0 && <div className="hint">搭配：{entry.collocations.join(" ｜ ")}</div>}
          <div className="actions three">
            <button type="button" className="btn danger" onClick={() => onDone("again")}>
              没想起来
            </button>
            <button type="button" className="btn warn" onClick={() => onDone("hard")}>
              有点模糊
            </button>
            <button type="button" className="btn good" onClick={() => onDone("good")}>
              想起来了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
