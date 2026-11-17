import { useRef, useState } from "react";
import type { AppState, Card } from "../types";
import type { Update } from "../store";
import { KIND_LABEL, KIND_ORDER, computeStats, resultLabel } from "../lib/scheduler";
import { confusions, missingImageRefs, part1Index, part1Questions } from "../lib/part1";
import { listImageKeys } from "../lib/imageStore";
import { displayWord } from "../lib/library";
import { exportBackup, parseBackup, keepSnapshot } from "../lib/storage";
import { DECK_NAME, scopeState } from "../lib/decks";
import { uid } from "../lib/util";
import { useNav } from "../components/nav";

function Stat({ label, value, total, note, testId }: { label: string; value: number; total: number; note: string; testId?: string }) {
  return (
    <div className="stat" data-testid={testId}>
      <p className="muted small">{label}</p>
      {total ? (
        <strong>
          {value} / {total}
        </strong>
      ) : (
        <strong className="empty">尚无记录</strong>
      )}
      <p className="muted small">{total ? note : "完成一次正式作答后显示"}</p>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "" : ` · ${v}%`);

export default function StatsPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const nav = useNav();
  const deck = state.settings.deck;
  const scoped = scopeState(state, deck);
  const s = computeStats(scoped, today);
  const confused = confusions(scoped, scoped.logs);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const maxDay = Math.max(1, ...s.days.map((d) => d.reviews + d.learned));
  const p1Learning = s.trackCounts.part1.learning + s.trackCounts.part1.due;

  const recent = scoped.logs
    .filter((l) => l.kind !== "learn")
    .slice(-30)
    .reverse();

  const weak = Object.values(scoped.tracks)
    .filter((t) => t.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 10);

  const download = () => {
    const blob = new Blob([exportBackup(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `生词复习备份-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** 复习一组常混淆的动作：把这组短语的听音选图题做一遍（练习，不改排期） */
  const reviewGroup = (phraseIds: string[]) => {
    const idx = part1Index(state);
    const senses = new Set(phraseIds.map((p) => idx.get(p)?.sense.id));
    const queue: Card[] = part1Questions(state)
      .filter((q) => senses.has(q.senseId))
      .map((q) => ({ id: uid("c"), type: "part1", entryId: q.entryId, senseId: q.senseId, exampleId: q.key, free: true }));
    if (!queue.length) return;
    update((st) => ({ ...st, session: { day: today, deck: "toeic", scope: "part1", index: 0, queue } }));
    nav.openPractice();
  };

  return (
    <section className="page">
      <h2>学习记录</h2>
      <p className="muted small">
        {DECK_NAME[deck]}词库 · 已学义项 {s.learnedSenses} / 词条 {scoped.order.length}
      </p>

      <div className="section-title">听力</div>
      <div className="stats">
        <Stat label="无字幕首听听懂" value={s.listening.first} total={s.listening.total} note={`重听 ${s.listening.replay} · 看字幕 ${s.listening.subtitle}${pct(s.listening.firstRate)}`} />
        {deck !== "toefl" && (
          <Stat
            testId="part1-stat"
            label="Part 1 首听答对"
            value={s.part1.first}
            total={s.part1.total}
            note={`${s.part1.total} 次正式作答${pct(s.part1.firstRate)}${s.part1.retries ? `；本轮重做 ${s.part1.retries} 次（答对 ${s.part1.retryCorrect}），不计入` : ""}`}
          />
        )}
      </div>

      <div className="section-title">理解、回忆与拼写</div>
      <div className="stats">
        <Stat label="新句理解答对" value={s.context.correct} total={s.context.total} note={`正式作答${pct(s.context.rate)}`} />
        <Stat label="文字回忆想起来" value={s.text.correct} total={s.text.total} note={`正式作答${pct(s.text.rate)}`} />
        <Stat label="生词本拼写正确" value={s.spelling.correct} total={s.spelling.total} note={`短文目标词 + 拼写复习${pct(s.spelling.rate)}`} />
        <Stat label="托福补词得分" value={s.passages.score} total={s.passages.total} note={`${s.passages.attempts} 篇次（不分词库）${pct(s.passages.rate)}`} />
      </div>

      {deck !== "toefl" && (s.part1.practice.total > 0 || p1Learning > 0) && (
        <div className="stats">
          {s.part1.practice.total > 0 && (
            <Stat
              testId="part1-practice-stat"
              label="Part 1 练习题首听答对"
              value={s.part1.practice.first}
              total={s.part1.practice.total}
              note={`自动出题，单独统计${pct(s.part1.practice.firstRate)}`}
            />
          )}
          <div className="stat">
            <p className="muted small">Part 1 学习中</p>
            <strong>{p1Learning}</strong>
            <p className="muted small">个短语 · 已掌握 {s.trackCounts.part1.mastered}</p>
          </div>
        </div>
      )}

      {deck !== "toefl" && (
        <>
          <div className="section-title">容易混淆</div>
          {confused.length === 0 ? (
            <p className="muted small">尚无记录。Part 1 听音选图正式复习里选错图时，会在这里列出混淆的动作组。</p>
          ) : (
            <div data-testid="part1-confusions">
              {confused.slice(0, 5).map((c) => {
                const idx = part1Index(state);
                return (
                  <div className="topic" key={c.phraseIds.join("|")}>
                    <h3>{c.phrases.join(" / ")}</h3>
                    <p className="muted">
                      {c.phraseIds.map((p) => idx.get(p)?.sense.gloss ?? p).join(" · ")} · 答错 {c.count} 次
                      {c.groupTitle && `（${c.groupTitle}）`}
                    </p>
                    <button type="button" className="btn-primary" onClick={() => reviewGroup(c.phraseIds)}>
                      复习这组动作
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <details>
        <summary>详细记录与统计口径</summary>
        <p className="muted small">
          正确率只统计正式作答。初学当天的回忆、本轮内的重做、自由练习、Part 1 练习题和语音不可用时的文字替代题分别记录，不计入。同一义项的文字、听力、新句理解、拼写和
          Part 1 选图各自排期。
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>练习</th>
              <th>今日待复习</th>
              <th>学习中</th>
              <th>已掌握</th>
            </tr>
          </thead>
          <tbody>
            {KIND_ORDER.map((k) => (
              <tr key={k}>
                <td>{KIND_LABEL[k]}</td>
                <td>{s.trackCounts[k].due}</td>
                <td>{s.trackCounts[k].learning}</td>
                <td>{s.trackCounts[k].mastered}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="sub-title">最近 14 天</h3>
        <div className="bars">
          {s.days.map((d) => (
            <div className="bar-col" key={d.day} title={`${d.day}：复习 ${d.reviews}（答对 ${d.correct}），新学 ${d.learned}`}>
              <div className="bar">
                <div className="bar-new" style={{ height: `${(d.learned / maxDay) * 100}%` }} />
                <div className="bar-rev" style={{ height: `${(d.reviews / maxDay) * 100}%` }} />
              </div>
              <span>{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          <span className="legend rev" /> 复习 <span className="legend new" /> 新学
        </p>
        {weak.length > 0 && (
          <>
            <h3 className="sub-title">容易出错</h3>
            <ul className="plain">
              {weak.map((t) => {
                const e = state.entries[t.entryId];
                const sense = e?.senses.find((x) => x.id === t.senseId);
                return (
                  <li key={`${t.senseId}|${t.kind}`}>
                    <b>{e ? displayWord(e) : t.entryId}</b> {sense?.gloss} · {KIND_LABEL[t.kind]} 出错 {t.lapses} 次
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h3 className="sub-title">最近作答</h3>
        {recent.length === 0 ? (
          <p className="muted small">尚无记录。</p>
        ) : (
          <ul className="plain">
            {recent.map((l) => {
              const e = state.entries[l.entryId];
              return (
                <li key={l.id}>
                  <span className="muted">{l.day.slice(5)}</span> <b>{e ? displayWord(e) : l.entryId}</b> · {KIND_LABEL[l.kind as "text"]} ·{" "}
                  <span className={l.correct ? "good-text" : "bad-text"}>{resultLabel(l.kind, l.result)}</span>
                  {l.practice && <span className="muted">（{l.retry ? "本轮重做" : l.free ? "练习" : "不计分"}）</span>}
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details>
        <summary>数据管理</summary>
        <p className="muted small">进度自动保存在本浏览器（localStorage）。换浏览器或清除网站数据前，请先导出备份。</p>
        <p className="muted small">
          备份只包含词库、进度和图片引用，不包含 Part 1 图片本身。恢复备份后，到「词库 → 导入 → Part 1 图片包」重新选择同一个 toeic-part1-image-pack.zip：图片会按
          phrase_id 重新绑定，已有词条和复习进度不受影响。
        </p>
        <div className="row wrap">
          <button type="button" className="btn-secondary" onClick={download}>
            导出备份 (.json)
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            从备份恢复
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="选择备份文件"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const next = parseBackup(await f.text());
                if (confirm("恢复备份会覆盖当前的词库和进度，确定吗？（当前数据会先保留一份副本）")) {
                  keepSnapshot(state, "before-restore");
                  update(() => next);
                  const missing = missingImageRefs(next, await listImageKeys().catch(() => new Set<string>()));
                  setMsg(
                    missing
                      ? `已从备份恢复。本机缺少 ${missing} 个词条的 Part 1 图片：请到「词库 → 导入 → Part 1 图片包」重新选择图片包 ZIP，图片会按 phrase_id 重新绑定。`
                      : "已从备份恢复",
                  );
                }
              } catch (err) {
                setMsg(`恢复失败：${err instanceof Error ? err.message : String(err)}`);
              }
              e.target.value = "";
            }}
          />
        </div>
        {msg && (
          <div className="banner" role="status">
            {msg}
            {msg.includes("缺少") && (
              <button type="button" className="btn-secondary small" onClick={() => nav.go({ tab: "library", sub: "import-part1" })}>
                去重新关联图片包
              </button>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
