import JSZip from "jszip";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export interface RawRow {
  /** 在 Word 表格中的行号（不含表头，从 1 开始） */
  row: number;
  word: string;
  phonetic: string;
  meaning: string;
}

export interface ParseResult {
  rows: RawRow[];
  /** 跳过的空行 / 无法识别的行 */
  skipped: number;
}

type ColMap = { word: number; phonetic: number; meaning: number };

function children(el: Element, local: string): Element[] {
  return Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === local,
  );
}

/** 读取单元格文字：保留段落、换行和制表符 */
function cellText(tc: Element): string {
  const paras: string[] = [];
  const walk = (node: Element, buf: string[]) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      switch (el.localName) {
        case "t":
          buf.push(el.textContent ?? "");
          break;
        case "tab":
          buf.push(" ");
          break;
        case "br":
        case "cr":
          buf.push("\n");
          break;
        case "tbl": // 嵌套表格不计入
        case "pPr":
        case "rPr":
        case "instrText":
          break;
        default:
          walk(el, buf);
      }
    }
  };
  for (const p of Array.from(tc.getElementsByTagNameNS(W_NS, "p"))) {
    const buf: string[] = [];
    walk(p, buf);
    paras.push(buf.join(""));
  }
  return paras.join("\n").replace(/\u00a0/g, " ").trim();
}

function detectHeader(cells: string[]): ColMap | null {
  const find = (re: RegExp) => cells.findIndex((c) => re.test(c.trim()));
  const word = find(/^(word|words|单词|词汇|词条)$/i);
  const meaning = find(/^(meaning|meanings|释义|中文|词义|解释|definition)$/i);
  if (word < 0 || meaning < 0) return null;
  return { word, meaning, phonetic: find(/phonetic|音标|pronunciation/i) };
}

/** 从 document.xml 解析生词表格（金山词霸「我的生词本」导出格式及类似的表格） */
export function parseDocumentXml(xml: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Word 文件内容无法解析（document.xml 格式错误）");
  }
  const rows: RawRow[] = [];
  let skipped = 0;
  let map: ColMap | null = null;
  const isNested = (t: Element) => {
    for (let p = t.parentElement; p; p = p.parentElement) if (p.localName === "tbl") return true;
    return false;
  };
  // 只处理顶层表格
  const tables = Array.from(doc.getElementsByTagNameNS(W_NS, "tbl")).filter((t) => !isNested(t));
  for (const tbl of tables) {
    for (const tr of children(tbl, "tr")) {
      const cells = children(tr, "tc").map(cellText);
      const header = detectHeader(cells);
      if (header) {
        map = header;
        continue;
      }
      // 没有表头时按「序号 / 单词 / 音标 / 释义」的默认列顺序
      const m: ColMap = map ?? (cells.length >= 4 ? { word: 1, phonetic: 2, meaning: 3 } : { word: 0, phonetic: -1, meaning: cells.length - 1 });
      const word = (cells[m.word] ?? "").replace(/\s+/g, " ").trim();
      const meaning = (cells[m.meaning] ?? "").trim();
      if (!word || !/[a-zA-Z]/.test(word)) {
        if (cells.some((c) => c)) skipped++;
        continue;
      }
      rows.push({
        row: rows.length + 1,
        word,
        phonetic: m.phonetic >= 0 ? (cells[m.phonetic] ?? "").replace(/\s+/g, " ").trim() : "",
        meaning,
      });
    }
  }
  return { rows, skipped };
}

export async function parseDocx(data: ArrayBuffer | Uint8Array | Blob): Promise<ParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("这不是有效的 .docx 文件（请在 Word 中另存为 .docx 后再导入）");
  }
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("文件里找不到 Word 正文（word/document.xml）");
  const xml = await file.async("string");
  const result = parseDocumentXml(xml);
  if (!result.rows.length) throw new Error("没有在文件里找到「单词 / 音标 / 释义」表格");
  return result;
}
