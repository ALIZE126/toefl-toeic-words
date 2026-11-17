import { useRef, useState } from "react";
import type { AppState } from "../types";
import type { Update } from "../store";
import { KIND_LABEL, KIND_ORDER, RESULT_LABEL, computeStats } from "../lib/scheduler";
import { displayWord } from "../lib/library";
import { exportBackup, parseBackup } from "../lib/storage";
import { DECK_NAME, scopeState } from "../lib/decks";

export default function StatsPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const deck = state.settings.deck;
  const scoped = scopeState(state, deck);
  const s = computeStats(scoped, today);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const maxDay = Math.max(1, ...s.days.map((d) => d.reviews + d.learned));

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

  return (
    <section className="stack">
      <div className="panel">
        <h2>
          学习记录{deck !== "all" && <span className="hint"> · {DECK_NAME[deck]}词库</span>}
        </h2>
        <div className="stat-grid">
          <div className="stat">
            <b>{pct(s.listening.firstRate)}</b>
            <span>无字幕首听正确率</span>
            <small>
              首听 {s.listening.first} · 重听 {s.listening.replay} · 看字幕 {s.listening.subtitle} / 共 {s.listening.total}
            </small>
          </div>
          <div className="stat">
            <b>{pct(s.context.rate)}</b>
            <span>新句理解正确率</span>
            <small>
              答对 {s.context.correct} / 共 {s.context.total}
            </small>
          </div>
          <div className="stat">
            <b>{pct(s.text.rate)}</b>
            <span>文字回忆正确率</span>
            <small>
              想起来 {s.text.correct} / 共 {s.text.total}
            </small>
          </div>
          <div className="stat">
            <b>{pct(s.spelling.rate)}</b>
            <span>生词本拼写正确率</span>
            <small>
              拼对 {s.spelling.correct} / 共 {s.spelling.total}（短文目标词 + 拼写复习）
            </small>
          </div>
          <div className="stat">
            <b>{pct(s.passages.rate)}</b>
            <span>补全单词短文得分率</span>
            <small>
              {s.passages.score} / {s.passages.total} 空 · 共做 {s.passages.attempts} 篇次
            </small>
          </div>
          <div className="stat">
            <b>{s.learnedSenses}</b>
            <span>已学义项</span>
            <small>
              {DECK_NAME[deck]}词库共 {scoped.order.length} 个词条
            </small>
          </div>
        </div>
        <p className="hint">补全单词短文得分不分词库。正确率只统计正式复习；初学当天的回忆、本轮内的重做和语音不可用时的文字替代题不计入。</p>
      </div>

      <div className="panel">
        <h3>各练习的进度</h3>
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
        <p className="hint">同一义项的文字、听力和拼写分开排期，例如文字已掌握、拼写仍待复习。</p>
      </div>

      <div className="panel">
        <h3>最近 14 天</h3>
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
        <div className="hint">
          <span className="legend rev" /> 复习 <span className="legend new" /> 新学
        </div>
      </div>

      {weak.length > 0 && (
        <div className="panel">
          <h3>容易出错</h3>
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
        </div>
      )}

      <div className="panel">
        <h3>最近作答</h3>
        {recent.length === 0 ? (
          <p className="hint">还没有作答记录。</p>
        ) : (
          <ul className="plain">
            {recent.map((l) => {
              const e = state.entries[l.entryId];
              return (
                <li key={l.id}>
                  <span className="hint">{l.day.slice(5)}</span> <b>{e ? displayWord(e) : l.entryId}</b> · {KIND_LABEL[l.kind as "text"]} ·{" "}
                  <span className={l.correct ? "good-text" : "bad-text"}>{RESULT_LABEL[l.result]}</span>
                  {l.practice && <span className="hint">（练习，不计分）</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>备份</h3>
        <p className="hint">进度自动保存在本浏览器（localStorage）。换浏览器或清除网站数据前，请先导出备份。</p>
        <div className="row">
          <button className="btn" onClick={download}>
            导出备份 (.json)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            从备份恢复
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const next = parseBackup(await f.text());
                if (confirm("恢复备份会覆盖当前的词库和进度，确定吗？")) {
                  update(() => next);
                  setMsg("已从备份恢复");
                }
              } catch (err) {
                setMsg(err instanceof Error ? err.message : String(err));
              }
              e.target.value = "";
            }}
          />
        </div>
        {msg && <div className="banner">{msg}</div>}
      </div>
    </section>
  );
}
