import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocx } from "../src/lib/docx";
import { importRows } from "../src/lib/library";
import { emptyState } from "../src/lib/storage";

export const DOCX_PATH = resolve(__dirname, "../fixtures/生词本.docx");

export async function loadFixtureRows() {
  const buf = readFileSync(DOCX_PATH);
  return parseDocx(new Uint8Array(buf));
}

export async function importedState() {
  const { rows } = await loadFixtureRows();
  return importRows(emptyState(), rows, "生词本.docx", "2026-11-16T08:00:00.000Z").state;
}

export const PACK_PATH = resolve(__dirname, "../fixtures/toeic-part1-image-pack.zip");
let packBytes: Uint8Array | null = null;
/** 真实的 Part 1 图片包 ZIP（240 条 / 240 张图） */
export function packZip(): Uint8Array {
  return (packBytes ??= new Uint8Array(readFileSync(PACK_PATH)));
}
