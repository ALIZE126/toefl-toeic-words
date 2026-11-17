/**
 * TOEFL iBT Reading「Complete the Words」挖空规则：
 * 保留首句；从第二句开始，每隔一个词挖掉一个词的后半部分，共 10 空。
 * 只数两个字母以上的纯字母单词（a / I、数字、带撇号或连字符的词不计数，也不挖空）。
 * 词长为 n 时保留前 floor(n/2) 个字母，例如 carved → car + ved，valleys → val + leys。
 */

export interface Blank {
  /** 第几空，从 0 开始 */
  index: number;
  /** 完整单词（文中实际词形） */
  word: string;
  prefix: string;
  answer: string;
}

export type Segment = { kind: "text"; text: string } | { kind: "blank"; blank: Blank };

export interface Cloze {
  firstSentence: string;
  segments: Segment[];
  blanks: Blank[];
}

export function splitWord(word: string): { prefix: string; answer: string } {
  const keep = Math.max(1, Math.floor(word.length / 2));
  return { prefix: word.slice(0, keep), answer: word.slice(keep) };
}

export function firstSentenceEnd(text: string): number {
  const m = /[.!?](?=\s|$)/.exec(text);
  return m ? m.index + 1 : text.length;
}

export function buildCloze(text: string, count = 10): Cloze {
  const end = firstSentenceEnd(text);
  const segments: Segment[] = [{ kind: "text", text: text.slice(0, end) }];
  const blanks: Blank[] = [];
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
  re.lastIndex = end;
  let last = end;
  let eligible = 0;
  let m: RegExpExecArray | null;
  while (blanks.length < count && (m = re.exec(text))) {
    const word = m[0];
    if (!/^[A-Za-z]{2,}$/.test(word)) continue;
    eligible++;
    if (eligible % 2 !== 0) continue; // 隔一个词挖一个
    if (m.index > last) segments.push({ kind: "text", text: text.slice(last, m.index) });
    const blank: Blank = { index: blanks.length, word, ...splitWord(word) };
    blanks.push(blank);
    segments.push({ kind: "blank", blank });
    last = m.index + word.length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return { firstSentence: text.slice(0, end), segments, blanks };
}

/** 按实际词形判分：只比较缺失的字母，忽略大小写和首尾空格 */
export function isBlankCorrect(blank: Pick<Blank, "answer">, input: string): boolean {
  return input.trim().toLowerCase() === blank.answer.toLowerCase();
}
