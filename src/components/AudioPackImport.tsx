import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { audioCount, audioKey, loadAudioIndex, onAudioIndexChange, putAudio, type StoredAudio } from "../lib/audioStore";

interface Manifest {
  format?: string;
  provider?: string;
  model?: string;
  voices?: { name: string; accent?: string; gender?: string }[];
  items: { text: string; file: string; voice?: string; accent?: string }[];
}

interface Loaded {
  file: string;
  manifest: Manifest;
  zip: JSZip;
  base: string;
  missing: number;
  already: number;
}

export async function readAudioPack(data: ArrayBuffer | Uint8Array, file: string): Promise<Loaded> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("这不是有效的 ZIP 文件");
  }
  const name = Object.keys(zip.files).find((n) => /(^|\/)audio-manifest\.json$/.test(n) && !n.includes("__MACOSX"));
  if (!name) throw new Error("ZIP 里没有 audio-manifest.json，不是音频包（图片包请在「Part 1 图片包」里导入）");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await zip.file(name)!.async("string"));
  } catch {
    throw new Error("audio-manifest.json 不是有效的 JSON");
  }
  if (manifest.format !== "words-audio-pack" || !Array.isArray(manifest.items)) throw new Error("audio-manifest.json 格式不对");
  const base = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
  const known = await loadAudioIndex();
  return {
    file,
    manifest,
    zip,
    base,
    missing: manifest.items.filter((i) => !zip.file(base + i.file)).length,
    already: manifest.items.filter((i) => known.has(audioKey(i.text))).length,
  };
}

export async function storeAudioPack(pack: Loaded, onProgress?: (n: number, total: number) => void): Promise<{ stored: number; skipped: number }> {
  const known = await loadAudioIndex();
  let batch: StoredAudio[] = [];
  let stored = 0;
  let skipped = 0;
  const items = pack.manifest.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const f = pack.zip.file(pack.base + it.file);
    const key = audioKey(it.text);
    if (!f || known.has(key)) {
      skipped++;
      continue;
    }
    const bytes = await f.async("uint8array");
    batch.push({ key, text: it.text, type: "audio/mpeg", data: bytes.slice().buffer as ArrayBuffer, voice: it.voice, accent: it.accent });
    stored++;
    if (batch.length >= 40) {
      await putAudio(batch);
      batch = [];
      onProgress?.(i + 1, items.length);
    }
  }
  await putAudio(batch);
  onProgress?.(items.length, items.length);
  return { stored, skipped };
}

export function useAudioCount(): number {
  const [n, setN] = useState(audioCount());
  useEffect(() => {
    void loadAudioIndex().then(() => setN(audioCount()));
    return onAudioIndexChange(() => setN(audioCount()));
  }, []);
  return n;
}

/** 词库 → 导入 → AI 语音包 */
export default function AudioPackImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pack, setPack] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const count = useAudioCount();

  const pick = async (file: File) => {
    setError(null);
    setReport(null);
    setBusy("正在读取音频包…");
    try {
      setPack(await readAudioPack(await file.arrayBuffer(), file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const confirm = async () => {
    if (!pack) return;
    setError(null);
    try {
      const r = await storeAudioPack(pack, (n, t) => setBusy(`正在保存语音 ${n} / ${t}`));
      setReport(`已导入「${pack.file}」：新保存 ${r.stored} 条，本机已有或缺文件 ${r.skipped} 条。之后播放这些句子会用 AI 语音。`);
      setPack(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="import-body" data-testid="audio-import">
      <h3>AI 语音包</h3>
      <p className="target-line">
        本机已有 AI 语音 <b>{count}</b> 条。有 AI 语音的句子会播放音频，其余仍用系统语音。
      </p>
      <p className="hint">选择用 scripts/part1-audio.mjs 生成的 toeic-part1-audio-pack.zip。语音保存在本机浏览器里，换设备或换网址需要再导入一次。</p>
      <button type="button" className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
        {busy ?? "选择音频包 .zip"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        data-testid="audio-zip-input"
        onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
      />
      {error && (
        <div className="banner error" role="alert">
          导入失败：{error}
        </div>
      )}
      {pack && (
        <div className="banner" data-testid="audio-preview">
          <b>导入前确认：{pack.file}</b>
          <div>
            共 {pack.manifest.items.length} 条语音，本机已有 {pack.already} 条，待保存 {pack.manifest.items.length - pack.already - pack.missing} 条
            {pack.missing > 0 && `，缺文件 ${pack.missing} 条`}。
          </div>
          <div>
            来源：{pack.manifest.provider ?? "未知"} {pack.manifest.model ?? ""}（AI 合成语音）
            {pack.manifest.voices?.length ? ` · 声音：${pack.manifest.voices.map((v) => `${v.name}（${v.accent ?? ""}${v.gender ?? ""}）`).join("、")}` : ""}
          </div>
          <div className="row wrap">
            <button type="button" className="btn-primary" disabled={!!busy} onClick={confirm}>
              {busy ?? "确认导入"}
            </button>
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => setPack(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {report && (
        <div className="banner good" role="status" data-testid="audio-report">
          {report}
        </div>
      )}
    </div>
  );
}
