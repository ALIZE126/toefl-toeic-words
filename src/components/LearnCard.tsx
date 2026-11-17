import { useState } from "react";
import type { Entry, Example, Sense, Settings } from "../types";
import { displayWord } from "../lib/library";
import { Highlight, PhoneticLine, Pill, SpeakButton } from "./common";
import PackImage from "./PackImage";

interface Props {
  entry: Entry;
  sense: Sense;
  example?: Example;
  settings: Settings;
  onDone: () => void;
}

/** 初学：先读（听）短句理解，再看释义 */
export default function LearnCard({ entry, sense, example, settings, onDone }: Props) {
  const [shown, setShown] = useState(false);
  const word = displayWord(entry);
  const multi = entry.senses.filter((s) => s.gloss).length > 1;

  return (
    <div className="card learn">
      <div className="card-kind">🌱 新学 · 短句理解</div>
      <div className="headword">
        {word}
        <SpeakButton text={word} settings={settings} />
      </div>
      <PhoneticLine entry={entry} />
      {multi && (
        <div className="cue">
          多义词：本次学习义项 {entry.senses.findIndex((s) => s.id === sense.id) + 1}/{entry.senses.length}
        </div>
      )}
      {sense.part1?.image && <PackImage image={sense.part1.image} alt={`${word} 配图`} className="learn-img" />}
      {example && (
        <>
          <p className="sentence big">
            <Highlight text={example.text} word={word} />
          </p>
          <div className="row">
            <SpeakButton text={example.text} settings={settings} label="🔊 朗读例句" />
            <SpeakButton text={example.text} settings={settings} label="🐢 慢速" slow />
            {example.kind === "self" ? <Pill>自编例句</Pill> : <Pill tone="info">原题例句{example.source ? `：${example.source}` : ""}</Pill>}
          </div>
        </>
      )}
      {!shown ? (
        <div className="actions">
          <button type="button" className="btn primary wide" onClick={() => setShown(true)}>
            先猜意思，再看释义
          </button>
        </div>
      ) : (
        <div className="reveal">
          <div className="gloss big">
            {sense.pos} {sense.gloss}
          </div>
          {example?.zh && <p className="zh">{example.zh}</p>}
          {entry.collocations.length > 0 && <div className="hint">搭配：{entry.collocations.join(" ｜ ")}</div>}
          <details className="hint">
            <summary>词本原始释义</summary>
            {entry.meaning}
          </details>
          <div className="actions">
            <button type="button" className="btn primary wide" onClick={onDone}>
              看懂了，稍后遮住答案回忆 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
