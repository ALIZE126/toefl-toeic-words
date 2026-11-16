import { useEffect, useMemo, useState } from "react";
import type { AppState, Card } from "../types";
import type { Update } from "../store";
import {
  KIND_LABEL,
  advanceSession,
  buildQueue,
  dueTracks,
  findSense,
  introduce,
  newCandidates,
  newQuota,
  recordAnswer,
  startSession,
  toGrade,
} from "../lib/scheduler";
import { contextChoices, listenChoices } from "../lib/questions";
import ListeningCard from "../components/ListeningCard";
import ContextCard from "../components/ContextCard";
import TextCard from "../components/TextCard";
import LearnCard from "../components/LearnCard";
import { englishVoices, loadVoices, speechSupported } from "../lib/speech";

interface Props {
  state: AppState;
  update: Update;
  today: string;
  goLibrary: () => void;
}

export default function ReviewPage({ state, update, today, goLibrary }: Props) {
  const session = state.session?.day === today ? state.session : undefined;
  const active = session && session.index < session.queue.length;

  if (!state.order.length) {
    return (
      <section className="panel center">
        <h2>还没有词库</h2>
        <p>先到「词库」导入你的 Word 生词本（.docx），再回来开始今日复习。</p>
        <button className="btn primary" onClick={goLibrary}>
          去导入生词本
        </button>
      </section>
    );
  }

  if (active) return <SessionPlayer state={state} update={update} today={today} />;
  return <Overview state={state} update={update} today={today} finished={!!session && session.queue.length > 0} />;
}

function Overview({ state, update, today, finished }: { state: AppState; update: Update; today: string; finished: boolean }) {
  const due = dueTracks(state, today);
  const count = (k: string) => due.filter((t) => t.kind === k).length;
  const quota = newQuota(state, today);
  const fresh = Math.min(quota, newCandidates(state).length);
  const total = buildQueue(state, today).length;
  const s = state.settings;

  return (
    <section className="stack">
      {finished && (
        <div className="panel done">
          <h2>🎉 本轮完成</h2>
          <p>答错和看字幕才懂的题已安排到明天。可以到「学习记录」查看正确率。</p>
        </div>
      )}
      <div className="panel">
        <h2>今日复习 · {today}</h2>
        <div className="due-grid">
          <div className="due-cell">
            <b>{count("listening")}</b>
            <span>🎧 无字幕听力</span>
          </div>
          <div className="due-cell">
            <b>{count("context")}</b>
            <span>🧩 新句理解</span>
          </div>
          <div className="due-cell">
            <b>{count("text")}</b>
            <span>📝 文字回忆</span>
          </div>
          <div className="due-cell">
            <b>{fresh}</b>
            <span>🌱 新学义项</span>
          </div>
        </div>
        <p className="hint">顺序：先听力（避免先看到文字），再新句理解、文字回忆，最后学新词。初学后第 1、3、7 天复习。</p>
        <button className="btn primary wide big" disabled={total === 0} onClick={() => update((st) => startSession(st, today))}>
          {total === 0 ? "今天没有要复习的了" : `开始今日复习（${total} 张）`}
        </button>
      </div>

      <div className="panel">
        <h3>设置</h3>
        <label className="setting">
          <input
            type="checkbox"
            checked={s.commuteMode}
            onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, commuteMode: e.target.checked } }))}
          />
          <span>
            <b>通勤模式</b>：不点选项，在心里作答后点按钮自评
          </span>
        </label>
        <label className="setting">
          <span>每天新学义项</span>
          <input
            type="number"
            min={0}
            max={50}
            value={s.newPerDay}
            onChange={(e) =>
              update((st) => ({ ...st, settings: { ...st.settings, newPerDay: Math.max(0, Math.min(50, Number(e.target.value) || 0)) } }))
            }
          />
        </label>
        <label className="setting">
          <span>语速 {s.rate.toFixed(2)}</span>
          <input
            type="range"
            min={0.6}
            max={1.2}
            step={0.05}
            value={s.rate}
            onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, rate: Number(e.target.value) } }))}
          />
        </label>
        <VoicePicker state={state} update={update} />
      </div>
    </section>
  );
}

function VoicePicker({ state, update }: { state: AppState; update: Update }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadVoices().then((v) => alive && setVoices(englishVoices(v)));
    return () => {
      alive = false;
    };
  }, []);
  if (!speechSupported()) return <div className="banner error">当前浏览器不支持语音合成，听力题可改做文字题。</div>;
  if (voices === null) return <div className="hint">正在读取系统语音…</div>;
  if (!voices.length) return <div className="banner warn">没有找到英文语音。听力题会提示改做文字题。</div>;
  return (
    <label className="setting">
      <span>英文语音</span>
      <select
        value={state.settings.voiceURI ?? ""}
        onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, voiceURI: e.target.value || undefined } }))}
      >
        <option value="">自动（优先美式）</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} · {v.lang}
          </option>
        ))}
      </select>
    </label>
  );
}

function SessionPlayer({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const session = state.session!;
  const card: Card = session.queue[session.index];
  const found = findSense(state, card.entryId, card.senseId);
  const example = found?.sense.examples.find((x) => x.id === card.exampleId);

  // 词条或例句已被删除：跳过
  const broken = !found || ((card.type === "listening" || card.type === "context") && !example);
  useEffect(() => {
    if (broken) update((st) => (st.session ? { ...st, session: { ...st.session, index: st.session.index + 1 } } : st));
  }, [broken, update]);

  const listen = useMemo(
    () => (found && example && card.type === "listening" ? listenChoices(state, found.entry, found.sense, example, card.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );
  const ctx = useMemo(
    () => (found && card.type === "context" ? contextChoices(state, found.entry, found.sense, card.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );

  if (broken) return null;
  const { entry, sense } = found!;
  const commute = state.settings.commuteMode;
  const remaining = session.queue.length - session.index;

  const answer = (result: Parameters<typeof recordAnswer>[1]["result"], extra: { plays?: number; audioFallback?: boolean } = {}) =>
    update((st) => {
      const s1 = recordAnswer(st, { card, result, day: today, ...extra });
      const failed = !extra.audioFallback && toGrade(result) === "fail";
      return { ...s1, session: advanceSession(st.session!, failed) };
    });

  const label = card.type === "learn" ? "新学" : KIND_LABEL[card.type];

  return (
    <section className="stack">
      <div className="session-bar">
        <span>
          第 {session.index + 1} / {session.queue.length} 张 · {label}
          {card.retry ? " · 重做" : ""}
        </span>
        <span className="hint">剩 {remaining}</span>
        <button
          className="btn ghost small"
          onClick={() => update((st) => ({ ...st, session: st.session ? { ...st.session, index: st.session.queue.length } : undefined }))}
        >
          结束本轮
        </button>
      </div>
      <div className="progress">
        <div style={{ width: `${(session.index / session.queue.length) * 100}%` }} />
      </div>

      {card.type === "learn" && (
        <LearnCard
          key={card.id}
          entry={entry}
          sense={sense}
          example={example}
          settings={state.settings}
          onDone={() => update((st) => ({ ...introduce(st, card.entryId, card.senseId, today), session: advanceSession(st.session!, false) }))}
        />
      )}
      {card.type === "text" && (
        <TextCard key={card.id} entry={entry} sense={sense} settings={state.settings} intro={card.intro} onDone={(r) => answer(r)} />
      )}
      {card.type === "listening" && listen && example && (
        <ListeningCard
          key={card.id}
          entry={entry}
          sense={sense}
          example={example}
          prompt={listen.prompt}
          choices={listen.choices}
          settings={state.settings}
          commute={commute}
          onDone={(d) => answer(d.result, { plays: d.plays, audioFallback: d.audioFallback })}
        />
      )}
      {card.type === "context" && ctx && example && (
        <ContextCard
          key={card.id}
          entry={entry}
          sense={sense}
          example={example}
          choices={ctx}
          settings={state.settings}
          commute={commute}
          onDone={(r) => answer(r)}
        />
      )}
    </section>
  );
}
