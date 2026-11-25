import { useRef, useState } from "react";
import type { AppState, ReadingTier } from "../types";
import type { Update } from "../store";
import { TIERS, applyReadingImport, parseReadingVocab, planReadingImport, readingGloss, type ReadingPack, type ReadingReport } from "../lib/readingVocab";

/** 词库 → 导入 → 托福阅读词汇册（阅读词汇数据.json） */
export default function ReadingVocabImport({ state, update, onShowRecent }: { state: AppState; update: Update; onShowRecent: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pack, setPack] = useState<ReadingPack | null>(null);
  const [tiers, setTiers] = useState<ReadingTier[]>([...TIERS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReadingReport | null>(null);

  const pick = async (file: File) => {
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      setPack(parseReadingVocab(await file.text(), file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const plan = pack ? planReadingImport(state, pack, tiers) : null;
  const confirm = () => {
    if (!pack || !plan) return;
    const r = applyReadingImport(state, pack, plan);
    update(() => r.state);
    setReport(r.report);
    setPack(null);
  };
  const sample = pack?.items.find((x) => x.gloss_type !== "整理释义" && x.meaning.length > 30);

  return (
    <div className="import-body" data-testid="reading-import">
      <h3>托福阅读词汇册</h3>
      <p className="target-line">
        目标词库：<b>托福</b>。选择「阅读词汇数据.json」，每个词带一句托福阅读原文例句。例句来自你本机的题库，只保存在这台设备上。
      </p>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "正在读取…" : "选择 阅读词汇数据.json"}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden data-testid="reading-json-input" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      {error && (
        <div className="banner error" role="alert">
          导入失败：{error}
        </div>
      )}
      {pack && plan && (
        <div className="banner" data-testid="reading-preview">
          <b>导入前确认：{pack.file}</b>
          <div>
            共 {pack.items.length} 条{pack.materials ? `（来自 ${pack.materials} 篇）` : ""}
            {pack.skipped > 0 && `，${pack.skipped} 条格式不对或重复，已跳过`}。选择要导入的分层：
          </div>
          <div className="row wrap">
            {TIERS.map((t) => (
              <label key={t} className="deck-choice">
                <input type="checkbox" checked={tiers.includes(t)} onChange={() => setTiers((xs) => (xs.includes(t) ? xs.filter((y) => y !== t) : [...xs, t]))} />
                <span>
                  {t} {pack.items.filter((x) => (x.priority ?? "话题识别") === t).length}
                </span>
              </label>
            ))}
          </div>
          <div>
            将新增 <b>{plan.create.length}</b> 个词条，词库已有 {plan.reuse.length} 个（加入托福词库并补上原题例句，进度保留）
            {plan.already.length > 0 && `，之前导入过 ${plan.already.length} 个（不变）`}。
          </div>
          {plan.reuse.length > 0 && (
            <div className="muted small">
              已有的词：
              {plan.reuse
                .slice(0, 12)
                .map((r) => r.item.word)
                .join("、")}
              {plan.reuse.length > 12 && " 等"}
            </div>
          )}
          {sample && (
            <div className="muted small">
              词典参考义会精简成学习用义项，原始释义完整保留。例如 {sample.word}：「{sample.meaning}」→「{readingGloss(sample).pos}
              {readingGloss(sample).gloss}」
            </div>
          )}
          <div className="row wrap">
            <button type="button" className="btn-primary" disabled={!tiers.length} onClick={confirm}>
              确认导入到托福词库
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPack(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {report && (
        <div className="banner good" role="status" data-testid="reading-report">
          <div>
            已导入「{report.file}」：新增 {report.added} 个词条，复用已有词条 {report.reused} 个（补上原题例句 {report.examplesAdded} 句）
            {report.already > 0 && `，之前导入过 ${report.already} 个`}。
          </div>
          <div>新学时按 先背 → 进阶 → 话题识别 的顺序出现。可以在「今日 → 学习设置」里调整每天新学的数量。</div>
          <button type="button" className="btn-plain" onClick={onShowRecent}>
            只看新增
          </button>
        </div>
      )}
    </div>
  );
}
