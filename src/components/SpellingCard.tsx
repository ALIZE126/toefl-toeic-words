import { useState } from "react";
import type { ContextResult, Entry, Sense } from "../types";
import type { SpellingItem } from "../lib/spelling";
import { isBlankCorrect, splitWord } from "../lib/cloze";
import BlankInput from "./BlankInput";
import { Highlight, PhoneticLine } from "./common";

interface Props {
  entry: Entry;
  sense: Sense;
  item: SpellingItem;
  onDone: (r: ContextResult) => void;
}

/** 拼写复习：换一句话，在原位补全单词的后半部分。提交前不显示完整单词和释义 */
export default function SpellingCard({ entry, sense, item, onDone }: Props) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ContextResult | null>(null);
  const { prefix, answer } = splitWord(item.form);
  const at = item.text.search(new RegExp(`\\b${item.form}\\b`));
  const before = item.text.slice(0, at);
  const after = item.text.slice(at + item.form.length);
  const submit = () => setResult(isBlankCorrect({ answer }, value) ? "correct" : "wrong");

  return (
    <div className="card spelling" data-testid="spelling-card">
      <div className="card-kind">✍️ 拼写复习 · 补全单词</div>
      <p className="sentence big cloze">
        {before}
        <BlankInput
          prefix={prefix}
          length={answer.length}
          value={value}
          onChange={setValue}
          label="补全这个单词缺少的字母"
          disabled={result !== null}
          status={result === null ? undefined : result === "correct" ? "right" : "wrong"}
          onEnter={() => result === null && value && submit()}
        />
        {after}
      </p>
      {result === null ? (
        <div className="actions">
          <button type="button" className="btn primary" disabled={!value.trim()} onClick={submit}>
            提交
          </button>
        </div>
      ) : (
        <div className="reveal">
          <div className={`result ${result === "correct" ? "good" : "bad"}`}>{result === "correct" ? "拼对了" : "拼错了"}</div>
          <div className="hint">
            你的输入：{prefix}
            <b>{value}</b> · 正确：{prefix}
            <b>{answer}</b>
          </div>
          <p className="sentence">
            <Highlight text={item.text} word={item.form} />
          </p>
          {item.zh && <p className="zh">{item.zh}</p>}
          <div className="word-line">
            <strong>{item.form}</strong> <PhoneticLine entry={entry} />
          </div>
          <div className="gloss">
            {sense.pos} {sense.gloss}
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => onDone(result)}>
              下一题 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
