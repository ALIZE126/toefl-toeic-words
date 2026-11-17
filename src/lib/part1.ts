import JSZip from "jszip";
import type {
  AppState,
  Entry,
  Example,
  Part1ContrastGroup,
  Part1Group,
  Part1Image,
  Part1Sense,
  Part1Source,
  Part1State,
  ReviewLog,
  Sense,
  TrackState,
} from "../types";
import { entryDecks } from "./decks";
import { normalizeWord } from "./util";

/* ───────────── 图片包 JSON 的结构（只列用到的字段） ───────────── */

interface RawSource {
  source_id: string;
  book_number: number;
  test: number;
  question_number: number;
  option: string;
  sentence: string;
  answer_status?: string;
  pdf_filename?: string;
  pdf_page?: number;
  actual_form?: string;
  visual_clue_zh?: string;
  visual_caution_zh?: string;
}

export interface RawPhrase {
  phrase_id: string;
  standard_phrase: string;
  meaning_zh: string;
  categories?: string[];
  category?: string;
  base_form_collocations?: string[];
  observed_forms?: string[];
  visual_clues_zh?: string[];
  visual_cautions_zh?: string[];
  sources?: RawSource[];
  photo_training_notes?: string;
  direct_contrast_warning_zh?: string;
  priority_rank?: number | null;
  image_path?: string;
  image_asset?: {
    path?: string;
    width?: number;
    height?: number;
    sha256?: string;
    scene_reference_en?: string;
    sentence?: string;
    visual_cue_zh?: string;
    visual_caution_zh?: string;
    match_quality?: string;
  };
}

interface RawGroup {
  id: string;
  image_phrase_ids: string[];
  randomize_image_order?: boolean;
  questions: { audio_text: string; correct_phrase_id: string }[];
}

export const PART1_CATEGORIES = ["人物动作", "物体状态", "位置关系"] as const;
/** 和对照图一起审核过、确认同一句话只匹配其中一张 */
export const REVIEWED_PAIR = "paired_photo_reviewed";

export interface LoadedPack {
  file: string;
  version?: string;
  jsonPath: string;
  phrases: RawPhrase[];
  /** 包内重复的 phrase_id（只取第一次出现的） */
  duplicateIds: string[];
  /** 包内不同 phrase_id、同一个短语 */
  duplicateNames: string[];
  /** phrase_id → ZIP 里的图片 */
  images: Map<string, JSZip.JSZipObject>;
  missingImages: { phraseId: string; phrase: string; path: string; reason: string }[];
  /** ZIP 里的图片文件总数 */
  imageFilesInZip: number;
  groups: Part1Group[];
  contrastGroups: Part1ContrastGroup[];
}

const IMAGE_EXT = /\.(webp|png|jpe?g)$/i;

function mimeOf(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  return ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp";
}

/** 以 JSON 所在目录为基准解析相对路径；越出 ZIP 根目录的路径返回 null */
export function resolveZipPath(baseDir: string, rel: string): string | null {
  const parts = (baseDir ? baseDir.split("/") : []).filter(Boolean);
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

/** 校验一组听音选图题：对照图齐全且已一起审核、每句话只对应组里的一张图 */
function validateGroup(g: RawGroup, byId: Map<string, RawPhrase>, images: Map<string, JSZip.JSZipObject>): Part1Group {
  const reasons: string[] = [];
  const ids = Array.isArray(g.image_phrase_ids) ? g.image_phrase_ids : [];
  if (new Set(ids).size < 2) reasons.push("对照图少于 2 张");
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) reasons.push(`对照图 ${id} 不在词条列表里`);
    else {
      if (!images.has(id)) reasons.push(`对照图 ${id}（${p.standard_phrase}）缺少图片`);
      if (p.image_asset?.match_quality !== REVIEWED_PAIR)
        reasons.push(`${id}（${p.standard_phrase}）还没和对照图一起审核（${p.image_asset?.match_quality ?? "无审核状态"}）`);
    }
  }
  const qs = Array.isArray(g.questions) ? g.questions : [];
  if (!qs.length) reasons.push("没有题目");
  const texts = new Set<string>();
  qs.forEach((q, i) => {
    if (!q.audio_text?.trim()) reasons.push(`第 ${i + 1} 题没有播报句`);
    if (!ids.includes(q.correct_phrase_id)) reasons.push(`第 ${i + 1} 题的答案 ${q.correct_phrase_id} 不在这组对照图里`);
    const t = q.audio_text?.trim().toLowerCase();
    if (t && texts.has(t)) reasons.push(`第 ${i + 1} 题的播报句和前面重复`);
    if (t) texts.add(t);
  });
  return {
    id: g.id,
    phraseIds: ids,
    randomize: g.randomize_image_order !== false,
    questions: qs.map((q, i) => ({ key: `${g.id}/q${i + 1}`, audioText: q.audio_text?.trim() ?? "", correctPhraseId: q.correct_phrase_id })),
    eligible: reasons.length === 0,
    reasons,
  };
}

/** 读取 Part 1 图片包 ZIP：找到 JSON，按 image_path 定位图片（不解压图片内容） */
export async function readPart1Pack(data: ArrayBuffer | Uint8Array | Blob, file: string): Promise<LoadedPack> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("这不是有效的 ZIP 文件");
  }
  const all = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)__MACOSX\//.test(f.name) && !/(^|\/)\._/.test(f.name));
  const jsons = all.filter((f) => f.name.toLowerCase().endsWith(".json"));
  const preferred = jsons.find((f) => /toeic-part1-phrases-with-images\.json$/i.test(f.name)) ?? jsons[0];
  if (!preferred) throw new Error("ZIP 里没有找到图片词库 JSON（toeic-part1-phrases-with-images.json）");
  let json: { phrases?: RawPhrase[]; image_pack?: { version?: string; graded_photo_questions?: RawGroup[] }; contrast_groups?: unknown[] };
  try {
    json = JSON.parse(await preferred.async("string"));
  } catch {
    throw new Error(`${preferred.name} 不是有效的 JSON`);
  }
  if (!Array.isArray(json.phrases)) throw new Error(`${preferred.name} 里没有 phrases 列表`);

  const baseDir = preferred.name.includes("/") ? preferred.name.slice(0, preferred.name.lastIndexOf("/")) : "";
  const byPath = new Map(all.map((f) => [f.name, f]));
  const byLower = new Map(all.map((f) => [f.name.toLowerCase(), f]));

  const phrases: RawPhrase[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const duplicateIds: string[] = [];
  const duplicateNames: string[] = [];
  const images = new Map<string, JSZip.JSZipObject>();
  const missingImages: LoadedPack["missingImages"] = [];

  for (const p of json.phrases) {
    if (!p || typeof p.phrase_id !== "string" || typeof p.standard_phrase !== "string" || !p.standard_phrase.trim()) continue;
    if (seenIds.has(p.phrase_id)) {
      duplicateIds.push(p.phrase_id);
      continue;
    }
    seenIds.add(p.phrase_id);
    const name = normalizeWord(p.standard_phrase);
    if (seenNames.has(name)) duplicateNames.push(p.standard_phrase);
    seenNames.add(name);
    phrases.push(p);

    const rel = p.image_path ?? p.image_asset?.path;
    if (!rel) {
      missingImages.push({ phraseId: p.phrase_id, phrase: p.standard_phrase, path: "", reason: "没有配图路径" });
      continue;
    }
    const full = resolveZipPath(baseDir, rel);
    const f = full ? (byPath.get(full) ?? byLower.get(full.toLowerCase())) : undefined;
    if (f) images.set(p.phrase_id, f);
    else missingImages.push({ phraseId: p.phrase_id, phrase: p.standard_phrase, path: rel, reason: full ? "ZIP 里没有这个文件" : "路径越出图片包目录" });
  }

  const byId = new Map(phrases.map((p) => [p.phrase_id, p]));
  const rawGroups = Array.isArray(json.image_pack?.graded_photo_questions) ? json.image_pack!.graded_photo_questions! : [];
  const contrastGroups: Part1ContrastGroup[] = (Array.isArray(json.contrast_groups) ? json.contrast_groups : [])
    .map((g) => g as { group_id?: string; title_zh?: string; phrases?: string[]; phrase_ids?: string[]; suitability?: string })
    .filter((g) => g.group_id && Array.isArray(g.phrase_ids))
    .map((g) => ({ id: g.group_id!, title: g.title_zh ?? g.group_id!, phrases: g.phrases ?? [], phraseIds: g.phrase_ids!, suitability: g.suitability ?? "" }));

  return {
    file,
    version: json.image_pack?.version,
    jsonPath: preferred.name,
    phrases,
    duplicateIds,
    duplicateNames,
    images,
    missingImages,
    imageFilesInZip: all.filter((f) => IMAGE_EXT.test(f.name)).length,
    groups: rawGroups.filter((g) => g && typeof g.id === "string").map((g) => validateGroup(g, byId, images)),
    contrastGroups,
  };
}

/* ───────────── 导入计划（确认前预览） ───────────── */

export type PhrasePlan =
  | { kind: "new"; phraseId: string; entryId: string }
  /** 词库里已有同一个词，且有意思相同的义项：复用这个义项 */
  | { kind: "reuseSense"; phraseId: string; entryId: string; senseId: string }
  /** 词库里已有同一个词，但没有意思相同的义项：在这个词条下新增义项 */
  | { kind: "newSense"; phraseId: string; entryId: string }
  /** 之前从图片包导入过：只补齐缺少的数据 */
  | { kind: "already"; phraseId: string; entryId: string; senseId: string };

export interface Part1Plan {
  items: PhrasePlan[];
  counts: { phrases: number; new: number; reuseSense: number; newSense: number; already: number };
  images: { inZip: number; alreadyStored: number; toStore: number; missing: number };
  /** 和词库已有词条同名的短语 */
  sameNameInLibrary: { phrase: string; entryId: string; senseGloss?: string }[];
  groups: { total: number; eligible: number; questions: number; eligibleQuestions: number };
}

export function part1SenseId(entryId: string, phraseId: string) {
  return `${entryId}#${phraseId}`;
}

/** phrase_id → 词条和义项 */
export function part1Index(state: AppState): Map<string, { entry: Entry; sense: Sense }> {
  const map = new Map<string, { entry: Entry; sense: Sense }>();
  for (const id of state.order) {
    const entry = state.entries[id];
    for (const sense of entry?.senses ?? []) if (sense.part1) map.set(sense.part1.phraseId, { entry, sense });
  }
  return map;
}

function bigrams(s: string): Set<string> {
  const cjk = s.replace(/[^\u4e00-\u9fff]+/g, "|");
  const out = new Set<string>();
  for (const part of cjk.split("|")) for (let i = 0; i + 1 < part.length; i++) out.add(part.slice(i, i + 2));
  return out;
}

/** 中文义项有相同的两字词（如「检查」），视为同一义项 */
export function sameSense(gloss: string, meaningZh: string): boolean {
  const a = bigrams(gloss);
  for (const b of bigrams(meaningZh)) if (a.has(b)) return true;
  return false;
}

function findEntryId(state: AppState, phrase: string): string | undefined {
  const id = normalizeWord(phrase);
  if (state.entries[id]) return id;
  return Object.values(state.entries).find((e) => e.spelling?.status === "confirmed" && e.correctedWord && normalizeWord(e.correctedWord) === id)?.id;
}

export function planPart1Import(state: AppState, pack: LoadedPack, storedKeys: Set<string>): Part1Plan {
  const index = part1Index(state);
  const items: PhrasePlan[] = [];
  const sameNameInLibrary: Part1Plan["sameNameInLibrary"] = [];
  const pendingNew = new Map<string, string>(); // 同一个包里同名短语：第二个作为新义项
  for (const p of pack.phrases) {
    const had = index.get(p.phrase_id);
    if (had) {
      items.push({ kind: "already", phraseId: p.phrase_id, entryId: had.entry.id, senseId: had.sense.id });
      continue;
    }
    const entryId = findEntryId(state, p.standard_phrase);
    if (entryId) {
      const entry = state.entries[entryId];
      const match = entry.senses.find((s) => !s.part1 && sameSense(s.gloss, p.meaning_zh));
      sameNameInLibrary.push({ phrase: p.standard_phrase, entryId, senseGloss: match?.gloss });
      items.push(match ? { kind: "reuseSense", phraseId: p.phrase_id, entryId, senseId: match.id } : { kind: "newSense", phraseId: p.phrase_id, entryId });
      continue;
    }
    const id = normalizeWord(p.standard_phrase);
    if (pendingNew.has(id)) items.push({ kind: "newSense", phraseId: p.phrase_id, entryId: id });
    else {
      pendingNew.set(id, p.phrase_id);
      items.push({ kind: "new", phraseId: p.phrase_id, entryId: id });
    }
  }
  const declared = (id: string) => pack.phrases.find((p) => p.phrase_id === id)?.image_asset?.sha256;
  let alreadyStored = 0;
  for (const id of pack.images.keys()) {
    const sha = index.get(id)?.sense.part1?.image?.sha256 ?? declared(id);
    if (sha && storedKeys.has(sha)) alreadyStored++;
  }
  const c = (k: PhrasePlan["kind"]) => items.filter((i) => i.kind === k).length;
  return {
    items,
    counts: { phrases: items.length, new: c("new"), reuseSense: c("reuseSense"), newSense: c("newSense"), already: c("already") },
    images: { inZip: pack.images.size, alreadyStored, toStore: pack.images.size - alreadyStored, missing: pack.missingImages.length },
    sameNameInLibrary,
    groups: {
      total: pack.groups.length,
      eligible: pack.groups.filter((g) => g.eligible).length,
      questions: pack.groups.reduce((n, g) => n + g.questions.length, 0),
      eligibleQuestions: pack.groups.filter((g) => g.eligible).reduce((n, g) => n + g.questions.length, 0),
    },
  };
}

/* ───────────── 图片写入 ───────────── */

async function sha256Hex(data: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null; // 非 https / localhost 时浏览器不提供，跳过校验
  const buf = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StoredImages {
  refs: Map<string, Part1Image>;
  stored: number;
  already: number;
  /** 内容和 JSON 里的 sha256 不一致（按实际内容保存） */
  mismatched: string[];
}

/**
 * 把图片写入本机图片库。本机已有（按 sha256）的跳过，只补齐缺少的。
 * put 由调用方注入（正式环境是 IndexedDB）。
 */
export async function storePackImages(
  pack: LoadedPack,
  storedKeys: Set<string>,
  put: (items: { sha256: string; type: string; data: ArrayBuffer }[]) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<StoredImages> {
  const refs = new Map<string, Part1Image>();
  const mismatched: string[] = [];
  let stored = 0;
  let already = 0;
  let batch: { sha256: string; type: string; data: ArrayBuffer }[] = [];
  const total = pack.images.size;
  let n = 0;
  for (const p of pack.phrases) {
    const f = pack.images.get(p.phrase_id);
    if (!f) continue;
    const a = p.image_asset ?? {};
    let sha = a.sha256;
    if (!sha || !storedKeys.has(sha)) {
      const bytes = await f.async("uint8array");
      const actual = await sha256Hex(bytes);
      if (actual && sha && actual !== sha) mismatched.push(p.phrase_id);
      sha = actual ?? sha ?? `path:${pack.version ?? ""}:${f.name}`;
      if (storedKeys.has(sha)) already++;
      else {
        batch.push({ sha256: sha, type: mimeOf(f.name), data: bytes.slice().buffer as ArrayBuffer });
        storedKeys.add(sha);
        stored++;
      }
    } else already++;
    refs.set(p.phrase_id, {
      sha256: sha,
      path: p.image_path ?? a.path ?? f.name,
      width: a.width,
      height: a.height,
      sceneEn: a.scene_reference_en ?? a.sentence,
      cue: a.visual_cue_zh || undefined,
      caution: a.visual_caution_zh || undefined,
      matchQuality: a.match_quality,
    });
    if (batch.length >= 20) {
      await put(batch);
      batch = [];
    }
    onProgress?.(++n, total);
  }
  await put(batch);
  return { refs, stored, already, mismatched };
}

/* ───────────── 写入词库 ───────────── */

function toSources(p: RawPhrase): Part1Source[] {
  return (p.sources ?? []).map((s) => ({
    sourceId: s.source_id,
    book: s.book_number,
    test: s.test,
    question: s.question_number,
    option: s.option,
    sentence: s.sentence,
    answerStatus: s.answer_status ?? "",
    pdfFile: s.pdf_filename,
    pdfPage: s.pdf_page,
    actualForm: s.actual_form,
    clue: s.visual_clue_zh || undefined,
    caution: s.visual_caution_zh || undefined,
  }));
}

export function sourceLabel(s: Part1Source): string {
  return `公式问题集 ${s.book} · Test ${s.test} · Q${s.question}(${s.option})${s.answerStatus ? ` · ${s.answerStatus}` : ""}`;
}

function sourceExamples(senseId: string, sources: Part1Source[], hasLearn: boolean, existing: Example[]): Example[] {
  const texts = new Set(existing.map((x) => x.text.trim().toLowerCase()));
  const out: Example[] = [];
  let learn = hasLearn;
  for (const s of sources) {
    const t = s.sentence?.trim();
    if (!t || texts.has(t.toLowerCase())) continue;
    texts.add(t.toLowerCase());
    out.push({ id: `${senseId}/src-${s.sourceId}`, text: t, role: learn ? "test" : "learn", kind: "original", source: sourceLabel(s) });
    learn = true;
  }
  return out;
}

function part1Info(p: RawPhrase, image?: Part1Image): Part1Sense {
  return {
    phraseId: p.phrase_id,
    categories: p.categories?.length ? [...p.categories] : p.category ? [p.category] : [],
    observedForms: p.observed_forms ?? [],
    visualClues: p.visual_clues_zh ?? [],
    visualCautions: p.visual_cautions_zh ?? [],
    trainingNote: p.photo_training_notes,
    contrastWarning: p.direct_contrast_warning_zh,
    sources: toSources(p),
    image,
    priorityRank: p.priority_rank ?? null,
  };
}

function questionSourceOf(sources: Part1Source[]): string {
  const list = sources.map((s) => `${s.book}-${s.test}-Q${s.question}${s.option}`);
  return list.length ? `托业 Part 1 · 公式问题集 ${list.slice(0, 6).join("、")}${list.length > 6 ? ` 等 ${list.length} 处` : ""}` : "";
}

export interface Part1Report {
  file: string;
  phrases: number;
  added: number;
  reusedSense: number;
  newSense: number;
  already: number;
  /** 补齐了数据的已导入词条 */
  filled: number;
  imagesStored: number;
  imagesAlready: number;
  imagesMissing: number;
  mismatched: number;
  eligibleQuestions: number;
}

/**
 * 按计划写入词库（纯函数）。
 * - 新短语：建托业词条，原始内容取自图片包；
 * - 同名已有词条：加入托业词库，复用意思相同的义项（保留编辑内容和进度），否则新增义项；
 * - 已导入过：只补齐缺少的数据（图片引用、新增的出处），不覆盖编辑过的内容。
 */
export function applyPart1Import(
  state: AppState,
  pack: LoadedPack,
  plan: Part1Plan,
  images: Map<string, Part1Image>,
  now = new Date().toISOString(),
): { state: AppState; report: Omit<Part1Report, "imagesStored" | "imagesAlready" | "mismatched"> } {
  const entries = { ...state.entries };
  const order = [...state.order];
  const byId = new Map(pack.phrases.map((p, i) => [p.phrase_id, { p, row: i + 1 }]));
  let filled = 0;

  const withDeck = (e: Entry): Entry => (entryDecks(e).includes("toeic") ? e : { ...e, decks: [...entryDecks(e), "toeic"] });
  const addCollocations = (e: Entry, list: string[] = []) => {
    const have = new Set(e.collocations.map((x) => x.toLowerCase()));
    const add = list.filter((x) => !have.has(x.toLowerCase()));
    return add.length ? [...e.collocations, ...add] : e.collocations;
  };

  for (const item of plan.items) {
    const { p, row } = byId.get(item.phraseId)!;
    const image = images.get(p.phrase_id);
    if (item.kind === "new") {
      const senseId = part1SenseId(item.entryId, p.phrase_id);
      const info = part1Info(p, image);
      entries[item.entryId] = {
        id: item.entryId,
        word: p.standard_phrase.trim(),
        phonetic: "",
        meaning: p.meaning_zh ?? "",
        senses: [
          { id: senseId, pos: "", gloss: p.meaning_zh ?? "", examples: sourceExamples(senseId, info.sources, false, []), origin: "auto", part1: info },
        ],
        collocations: [...(p.base_form_collocations ?? [])],
        questionSource: questionSourceOf(info.sources),
        note: "",
        curated: false,
        decks: ["toeic"],
        source: { file: pack.file, row, firstImportedAt: now, lastImportedAt: now },
        createdAt: now,
        updatedAt: now,
      };
      order.push(item.entryId);
      continue;
    }
    const old = entries[item.entryId];
    if (!old) continue;
    if (item.kind === "reuseSense" || item.kind === "newSense") {
      const info = part1Info(p, image);
      let senses: Sense[];
      if (item.kind === "reuseSense") {
        senses = old.senses.map((s) =>
          s.id === item.senseId
            ? { ...s, part1: info, examples: [...s.examples, ...sourceExamples(s.id, info.sources, s.examples.some((x) => x.role === "learn"), s.examples)] }
            : s,
        );
      } else {
        const senseId = part1SenseId(old.id, p.phrase_id);
        senses = [...old.senses, { id: senseId, pos: "", gloss: p.meaning_zh ?? "", examples: sourceExamples(senseId, info.sources, false, []), origin: "auto", part1: info }];
      }
      entries[old.id] = {
        ...withDeck(old),
        senses,
        collocations: addCollocations(old, p.base_form_collocations),
        questionSource: old.questionSource || questionSourceOf(info.sources),
        updatedAt: now,
      };
      continue;
    }
    // already：只补齐缺少的数据
    let changed = false;
    const senses = old.senses.map((s) => {
      if (s.id !== item.senseId || !s.part1) return s;
      let part1 = s.part1;
      let examples = s.examples;
      if (!part1.image && image) {
        part1 = { ...part1, image };
        changed = true;
      }
      const have = new Set(part1.sources.map((x) => x.sourceId));
      const fresh = toSources(p).filter((x) => !have.has(x.sourceId));
      if (fresh.length) {
        part1 = { ...part1, sources: [...part1.sources, ...fresh] };
        examples = [...examples, ...sourceExamples(s.id, fresh, examples.some((x) => x.role === "learn"), examples)];
        changed = true;
      }
      for (const k of ["visualClues", "visualCautions", "observedForms", "categories"] as const) {
        const src = part1Info(p)[k];
        if (!part1[k].length && src.length) {
          part1 = { ...part1, [k]: src };
          changed = true;
        }
      }
      return part1 === s.part1 ? s : { ...s, part1, examples };
    });
    const next: Entry = withDeck({ ...old, senses });
    if (next.decks !== old.decks) changed = true;
    if (changed) {
      filled++;
      entries[old.id] = { ...next, updatedAt: now, source: { ...old.source, lastImportedAt: now } };
    }
  }

  const prev: Part1State = state.part1 ?? { groups: [], contrastGroups: [], packs: [] };
  const groups = [...prev.groups];
  for (const g of pack.groups) {
    const i = groups.findIndex((x) => x.id === g.id);
    if (i < 0) groups.push(g);
    else {
      const keys = new Set(groups[i].questions.map((q) => q.key));
      groups[i] = { ...g, questions: [...groups[i].questions, ...g.questions.filter((q) => !keys.has(q.key))] };
    }
  }
  const part1: Part1State = {
    groups,
    contrastGroups: pack.contrastGroups.length ? pack.contrastGroups : prev.contrastGroups,
    packs: [...prev.packs, { at: now, file: pack.file, version: pack.version, phrases: pack.phrases.length, images: images.size }],
  };

  return {
    state: { ...state, entries, order, part1 },
    report: {
      file: pack.file,
      phrases: plan.counts.phrases,
      added: plan.counts.new,
      reusedSense: plan.counts.reuseSense,
      newSense: plan.counts.newSense,
      already: plan.counts.already,
      filled,
      imagesMissing: pack.missingImages.length,
      eligibleQuestions: plan.groups.eligibleQuestions,
    },
  };
}

/* ───────────── 听音选图题 ───────────── */

export interface ResolvedQuestion {
  key: string;
  groupId: string;
  audioText: string;
  randomize: boolean;
  correctPhraseId: string;
  entryId: string;
  senseId: string;
  options: { phraseId: string; entry: Entry; sense: Sense; image: Part1Image }[];
}

/** 可进入正式复习的题：组通过校验，且每张对照图都在词库里、有图片引用 */
export function part1Questions(state: AppState): ResolvedQuestion[] {
  const index = part1Index(state);
  const out: ResolvedQuestion[] = [];
  for (const g of state.part1?.groups ?? []) {
    if (!g.eligible) continue;
    const options = g.phraseIds.map((id) => {
      const hit = index.get(id);
      return hit?.sense.part1?.image ? { phraseId: id, entry: hit.entry, sense: hit.sense, image: hit.sense.part1.image } : null;
    });
    if (options.some((o) => !o)) continue;
    for (const q of g.questions) {
      const correct = options.find((o) => o!.phraseId === q.correctPhraseId);
      if (!correct) continue;
      out.push({
        key: q.key,
        groupId: g.id,
        audioText: q.audioText,
        randomize: g.randomize,
        correctPhraseId: q.correctPhraseId,
        entryId: correct.entry.id,
        senseId: correct.sense.id,
        options: options as ResolvedQuestion["options"],
      });
    }
  }
  return out;
}

/** 同一短语有多道题时，优先用和上次不同的场景复测 */
export function pickPart1Question(state: AppState, t: TrackState): ResolvedQuestion | undefined {
  const all = part1Questions(state).filter((q) => q.senseId === t.senseId);
  if (!all.length) return undefined;
  const fresh = all.filter((q) => q.key !== t.lastItem);
  const pool = fresh.length ? fresh : all;
  return pool[t.reviews % pool.length];
}

export function hasPart1(e: Entry): boolean {
  return e.senses.some((s) => s.part1);
}

export function part1Categories(e: Entry): string[] {
  return [...new Set(e.senses.flatMap((s) => s.part1?.categories ?? []))];
}

/** 常混淆的动作组：正式复习里答错时，正确短语和选中的短语 */
export function confusions(state: AppState, logs: ReviewLog[] = state.logs) {
  const index = part1Index(state);
  const phraseOfSense = new Map([...index.entries()].map(([pid, v]) => [v.sense.id, pid]));
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.kind !== "part1" || l.practice || l.correct || !l.chosen) continue;
    const a = phraseOfSense.get(l.senseId);
    if (!a || a === l.chosen) continue;
    const key = [a, l.chosen].sort().join("|");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const name = (pid: string) => index.get(pid)?.entry.word ?? pid;
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([key, count]) => {
      const ids = key.split("|");
      const group = state.part1?.contrastGroups.find((g) => ids.every((id) => g.phraseIds.includes(id)));
      return { phraseIds: ids, phrases: ids.map(name), count, groupTitle: group?.title };
    });
}

/** 本机缺少图片的词条数（恢复备份后用来提示重新绑定图片包） */
export function missingImageRefs(state: AppState, keys: Set<string>): number {
  let n = 0;
  for (const e of Object.values(state.entries)) for (const s of e.senses) if (s.part1?.image && !keys.has(s.part1.image.sha256)) n++;
  return n;
}
