import type { Entry, Example, Sense, Settings } from "../types";
import { displayWord } from "../lib/library";
import { Highlight, PhoneticLine, Pill, SpeakButton } from "./common";
import PackImage from "./PackImage";
import { ActionBar, useCardState } from "./session";

interface Props {
  entry: Entry;
  sense: Sense;
  example?: Example;
  settings: Settings;
  onDone: () => void;
}

/** 新学：先读（听）短句猜意思 → 显示释义 → 继续（稍后遮住答案回忆） */
export default function LearnCard({ entry, sense, example, settings, onDone }: Props) {
  const [shown, setShown] = useCardState("shown", false);
  const word = displayWord(entry);
  const multi = entry.senses.filter((s) => s.gloss).length > 1;

  return (
    <div className="study learn">
      <span className="pill">新学 · 短句理解</span>
      <div className="headword">
        <h3 className="word">{word}</h3>
        <SpeakButton text={word} settings={settings} />
      </div>
      <PhoneticLine entry={entry} />
      {multi && (
        <p className="muted small">
          多义词：本次学习义项 {entry.senses.findIndex((s) => s.id === sense.id) + 1} / {entry.senses.length}
        </p>
      )}
      {sense.part1?.image && <PackImage image={sense.part1.image} alt={`${word} 配图`} className="photo" zoomable />}
      {example && (
        <div className="sentence-block">
          <p className="sentence big">
            <Highlight text={example.text} word={word} />
          </p>
          <div className="row wrap">
            <SpeakButton text={example.text} settings={settings} label="朗读例句" />
            <SpeakButton text={example.text} settings={settings} label="慢速" slow />
            {example.kind === "self" ? <Pill>自编例句</Pill> : <Pill tone="info">原题例句</Pill>}
          </div>
        </div>
      )}
      {!shown && <p className="muted small">先根据句子猜一猜意思，再显示释义。</p>}
      {shown && (
        <div className="answer">
          <h3>
            {sense.pos} {sense.gloss}
          </h3>
          {example?.zh && <p>{example.zh}</p>}
          {(entry.collocations.length > 0 || example?.source || entry.meaning) && (
            <details>
              <summary>搭配、来源与完整释义</summary>
              {entry.collocations.length > 0 && <p className="muted small">搭配：{entry.collocations.join(" ｜ ")}</p>}
              {example?.source && <p className="muted small">例句来源：{example.source}</p>}
              <p className="muted small">词本原始释义：{entry.meaning}</p>
            </details>
          )}
        </div>
      )}
      <ActionBar>
        {!shown ? (
          <button type="button" className="btn-primary" onClick={() => setShown(true)}>
            显示释义
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={onDone}>
            继续
          </button>
        )}
      </ActionBar>
    </div>
  );
}
