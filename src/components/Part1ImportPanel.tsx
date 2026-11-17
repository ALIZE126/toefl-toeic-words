import { useRef, useState } from "react";
import type { AppState } from "../types";
import type { Update } from "../store";
import {
  applyPart1Import,
  planPart1Import,
  readPart1Pack,
  storePackImages,
  type LoadedPack,
  type Part1Plan,
  type Part1Report,
} from "../lib/part1";
import { imageStoreSupported, listImageKeys, putImages, requestPersistence } from "../lib/imageStore";
import ImageStatus from "./ImageStatus";

/** 词库 → 托业：导入 Part 1 图片词库（ZIP）。先预览，确认后写入 */
export default function Part1ImportPanel({ state, update }: { state: AppState; update: Update }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<LoadedPack | null>(null);
  const [plan, setPlan] = useState<Part1Plan | null>(null);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<Part1Report | null>(null);

  const pick = async (file: File) => {
    setError(null);
    setReport(null);
    setPack(null);
    setBusy("正在读取图片包…");
    try {
      const p = await readPart1Pack(await file.arrayBuffer(), file.name);
      const k = await listImageKeys();
      setKeys(k);
      setPack(p);
      setPlan(planPart1Import(state, p, k));
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
    setBusy("正在保存图片…");
    try {
      const stored = await storePackImages(pack, new Set(keys), putImages, (n, total) => setBusy(`正在保存图片 ${n} / ${total}`));
      const freshPlan = planPart1Import(state, pack, keys);
      const r = applyPart1Import(state, pack, freshPlan, stored.refs);
      update(() => r.state);
      setReport({ ...r.report, imagesStored: stored.stored, imagesAlready: stored.already, mismatched: stored.mismatched.length });
      setPack(null);
      setPlan(null);
      void requestPersistence();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="import-body" data-testid="part1-import">
      <h3>托业 Part 1 图片包</h3>
      <p className="target-line">
        目标词库：<b>托业</b>（Part 1 图片包固定导入托业词库，已有同名词会同时加入托业）
      </p>
      <p className="hint">
        选择图片包 ZIP（里面有 toeic-part1-phrases-with-images.json 和 images/ 文件夹）。确认前会先显示能导入多少词条和图片。图片保存在本机浏览器的
        IndexedDB 里。
      </p>
      {!imageStoreSupported() && <div className="banner error">当前浏览器不支持 IndexedDB，图片无法保存。</div>}
      <ImageStatus state={state} showOk />
      <div className="row">
        <button type="button" className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy ?? "选择图片包 .zip"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          hidden
          data-testid="part1-zip-input"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
      </div>
      {error && (
        <div className="banner error" role="alert">
          导入失败：{error}
          <button type="button" className="btn-secondary small" disabled={!!busy} onClick={() => (pack ? confirm() : fileRef.current?.click())}>
            {pack ? "重试导入" : "重新选择文件"}
          </button>
        </div>
      )}

      {pack && plan && (
        <div className="banner" data-testid="part1-preview">
          <b>导入前确认：{pack.file}</b>
          <div>
            可导入词条 <b>{plan.counts.phrases}</b> 条：新增 {plan.counts.new} 个词条
            {plan.counts.reuseSense > 0 && `，复用已有义项 ${plan.counts.reuseSense} 个`}
            {plan.counts.newSense > 0 && `，在已有词条下新增义项 ${plan.counts.newSense} 个`}
            {plan.counts.already > 0 && `，之前已导入 ${plan.counts.already} 个（只补齐缺少的数据）`}。
          </div>
          <div>
            图片 <b>{plan.images.inZip}</b> 张：本机已有 {plan.images.alreadyStored} 张，待保存 {plan.images.toStore} 张（ZIP 里共 {pack.imageFilesInZip}{" "}
            个图片文件）。
          </div>
          <div>
            重复项：包内重复 phrase_id {pack.duplicateIds.length} 个、同名短语 {pack.duplicateNames.length} 个；和词库已有词条同名{" "}
            {plan.sameNameInLibrary.length} 个
            {plan.sameNameInLibrary.length > 0 &&
              `（${plan.sameNameInLibrary
                .slice(0, 8)
                .map((x) => `${x.phrase}${x.senseGloss ? ` → 复用义项「${x.senseGloss}」` : " → 新增义项"}`)
                .join("、")}）`}
            。
          </div>
          <div>
            缺失图片：<b>{pack.missingImages.length}</b> 张
            {pack.missingImages.length > 0 &&
              `（${pack.missingImages
                .slice(0, 10)
                .map((m) => `${m.phraseId} ${m.phrase}：${m.reason}`)
                .join("；")}${pack.missingImages.length > 10 ? " 等" : ""}）。这些词条仍会作为文字和音频词条导入`}
            。
          </div>
          <div>
            可判分的听音选图：{plan.groups.total} 组 {plan.groups.questions} 题，通过校验 {plan.groups.eligible} 组 {plan.groups.eligibleQuestions} 题。
            {pack.groups
              .filter((g) => !g.eligible)
              .map((g) => (
                <div key={g.id} className="hint">
                  {g.id} 不进入正式复习：{g.reasons.join("；")}
                </div>
              ))}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!!busy} onClick={confirm}>
              {busy ?? "确认导入到托业词库"}
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => {
                setPack(null);
                setPlan(null);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="banner good" role="status" data-testid="part1-report">
          <div>
            已导入「{report.file}」：{report.phrases} 条短语，新增 {report.added} 个词条
            {report.reusedSense > 0 && `，复用已有义项 ${report.reusedSense} 个`}
            {report.newSense > 0 && `，新增义项 ${report.newSense} 个`}
            {report.already > 0 && `，已导入过 ${report.already} 个（补齐了 ${report.filled} 个）`}。
          </div>
          <div>
            图片：新保存 {report.imagesStored} 张，本机已有 {report.imagesAlready} 张{report.imagesMissing > 0 && `，缺失 ${report.imagesMissing} 张`}
            {report.mismatched > 0 && `，${report.mismatched} 张内容和 JSON 里的校验值不一致（已按实际内容保存）`}。
          </div>
          <div>到「今日复习 → 托业 Part 1 专项」开始看图学短语和听音选图（可判分 {report.eligibleQuestions} 题）。</div>
        </div>
      )}
    </div>
  );
}
