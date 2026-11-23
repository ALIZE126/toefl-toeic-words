#!/usr/bin/env node
/**
 * 用 ElevenLabs 生成 AI 语音，打成音频包 ZIP（在 App 的「词库 → 导入 → AI 语音包」导入）。
 * 内容：托业 Part 1 图片包的句子和短语、生词本（.docx）里的单词、内置练习例句、拼写复习备用句。
 *
 *   node scripts/part1-audio.mjs [图片包.zip] [输出.zip] [生词本.docx]
 *
 * - API key 从 ~/.config/words-tts.env 读取（ELEVENLABS_API_KEY 或 ELEVENLAB_API_KEY），不会写进项目或音频包。
 * - 已生成的音频缓存在 fixtures/tts-cache/，中断后重跑只生成缺少的，不重复扣额度。
 * - 5 个声音轮换（美 / 英 / 澳口音），同一句话总是同一个声音。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = resolve(process.argv[2] ?? join(ROOT, "fixtures/toeic-part1-image-pack.zip"));
const OUT = resolve(process.argv[3] ?? join(ROOT, "fixtures/words-audio-pack.zip"));
const DOCX = resolve(process.argv[4] ?? join(ROOT, "fixtures/生词本.docx"));
const CACHE = join(ROOT, "fixtures/tts-cache");
const MODEL = "eleven_multilingual_v2";
const FORMAT = "mp3_44100_64";
const CONCURRENCY = 2;

const VOICES = [
  { name: "Laura", id: "FGY2WhTYpPnrIDTdsKH5", accent: "美式", gender: "女" },
  { name: "Eric", id: "cjVigY5qzO86Huf0OWal", accent: "美式", gender: "男" },
  { name: "Alice", id: "Xb7hH8MSUJpSbSDYk0k2", accent: "英式", gender: "女" },
  { name: "George", id: "JBFqnCBsd6RMkjVDRZzb", accent: "英式", gender: "男" },
  { name: "Charlie", id: "IKne3meq5aSn9XLyUdCD", accent: "澳式", gender: "男" },
];

function readKey() {
  const f = join(homedir(), ".config/words-tts.env");
  const env = existsSync(f) ? readFileSync(f, "utf8") : "";
  const m = env.match(/^\s*ELEVENLABS?_API_KEY\s*=\s*(\S+)/m);
  const key = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVENLAB_API_KEY ?? m?.[1];
  if (!key) throw new Error(`没有找到 ElevenLabs API key（${f}）`);
  return key;
}

/** 和 App 里 audioKey() 一致：用于按文字查找音频 */
function norm(t) {
  return t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

async function collectTexts() {
  const zip = await JSZip.loadAsync(readFileSync(PACK));
  const name = Object.keys(zip.files).find((n) => /toeic-part1-phrases-with-images\.json$/i.test(n) && !n.includes("__MACOSX"));
  if (!name) throw new Error("图片包里没有 toeic-part1-phrases-with-images.json");
  const d = JSON.parse(await zip.file(name).async("string"));
  const texts = new Map(); // norm → { text, kinds }
  const add = (t, kind) => {
    if (!t || !t.trim()) return;
    const k = norm(t);
    const hit = texts.get(k) ?? { text: t.trim(), kinds: new Set() };
    hit.kinds.add(kind);
    texts.set(k, hit);
  };
  for (const p of d.phrases ?? []) {
    add(p.image_asset?.scene_reference_en ?? p.image_asset?.sentence, "scene");
    for (const s of p.sources ?? []) add(s.sentence, "source");
    add(p.standard_phrase, "phrase");
  }
  for (const g of d.image_pack?.graded_photo_questions ?? []) for (const q of g.questions ?? []) add(q.audio_text, "graded");

  // 生词本里的单词（读原始单词；已知拼写错误另外加上正确写法）
  if (existsSync(DOCX)) {
    const x = await (await JSZip.loadAsync(readFileSync(DOCX))).file("word/document.xml").async("string");
    const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const rows = x.match(/<w:tr\b[^P][\s\S]*?<\/w:tr>/g) ?? [];
    for (const r of rows) {
      const cell = (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [])[1];
      if (!cell) continue;
      const w = unesc((cell.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")).trim();
      if (/[a-z]/i.test(w) && !/^word$/i.test(w)) add(w, "word");
    }
    add("permanent", "word");
  }
  // 内置练习例句（学习句 / 复测句）和拼写复习的备用句
  for (const f of ["src/data/curated.ts", "src/data/passages.ts"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const m of src.matchAll(/\btext:\s*"((?:[^"\\]|\\.)+)"/g)) {
      const t = m[1].replace(/\\(.)/g, "$1");
      if (t.split(/\s+/).length >= 3 && t.length < 200) add(t, f.includes("curated") ? "example" : "spelling");
    }
  }
  return [...texts.entries()].map(([key, v]) => ({ key, text: v.text, kinds: [...v.kinds] }));
}

async function tts(key, voice, text) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const body = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 6 && !/quota/i.test(body)) {
      await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    const err = new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
    err.fatal = r.status === 401 || /quota|credits/i.test(body);
    throw err;
  }
}

async function main() {
  const key = readKey();
  const items = await collectTexts();
  const chars = items.reduce((n, x) => n + x.text.length, 0);
  console.log(`共 ${items.length} 条（${chars} 字符）：`, Object.entries(items.flatMap((x) => x.kinds).reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})));
  mkdirSync(CACHE, { recursive: true });

  let done = 0;
  let made = 0;
  let spent = 0;
  const failed = [];
  const plan = items.map((it) => {
    const voice = VOICES[parseInt(sha1(it.key).slice(0, 8), 16) % VOICES.length];
    return { ...it, voice, file: join(CACHE, `${voice.name}-${sha1(it.key)}.mp3`) };
  });
  const queue = plan.filter((p) => !existsSync(p.file));
  console.log(`缓存里已有 ${plan.length - queue.length} 条，需要生成 ${queue.length} 条（约 ${queue.reduce((n, x) => n + x.text.length, 0)} 字符）`);

  let stop = null;
  const worker = async () => {
    while (queue.length && !stop) {
      const it = queue.shift();
      try {
        writeFileSync(it.file, await tts(key, it.voice, it.text));
        made++;
        spent += it.text.length;
      } catch (e) {
        failed.push({ text: it.text, error: e.message });
        if (e.fatal) stop = e;
      }
      if (++done % 25 === 0 || !queue.length) console.log(`  进度 ${done} 条，新生成 ${made}，失败 ${failed.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (stop) console.log("停止：", stop.message);

  const zip = new JSZip();
  const manifest = {
    format: "words-audio-pack",
    version: 1,
    created: new Date().toISOString(),
    provider: "ElevenLabs",
    model: MODEL,
    note: "AI 合成语音：托业 Part 1 句子和短语、生词本单词、内置例句",
    voices: VOICES.map(({ name, accent, gender }) => ({ name, accent, gender })),
    items: [],
  };
  for (const p of plan) {
    if (!existsSync(p.file)) continue;
    const file = `audio/${sha1(p.key)}.mp3`;
    zip.file(file, readFileSync(p.file));
    manifest.items.push({ text: p.text, file, voice: p.voice.name, accent: p.voice.accent, kinds: p.kinds });
  }
  zip.file("audio-manifest.json", JSON.stringify(manifest, null, 1));
  writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));
  console.log(`本次新生成 ${made} 条（约 ${spent} 字符），音频包共 ${manifest.items.length} / ${plan.length} 条 → ${OUT}`);
  if (failed.length) {
    writeFileSync(join(CACHE, "failed.json"), JSON.stringify(failed, null, 1));
    console.log(`失败 ${failed.length} 条，详情见 fixtures/tts-cache/failed.json；重跑脚本只会补生成缺少的`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("出错：", e.message);
  process.exit(1);
});
