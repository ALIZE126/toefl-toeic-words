import { useEffect, useState } from "react";
import type { AppState, TrackKind } from "../types";
import type { Update } from "../store";
import { buildQueue, dueTracks, newCandidates, newQuota } from "../lib/scheduler";
import { addDays } from "../lib/util";
import { DECK_NAME, scopeState } from "../lib/decks";
import { QUALITY_LABEL, currentVoice, englishVoices, isAppleMobile, loadVoices, refreshVoices, speak, speechOptions, speechSupported, voiceQuality } from "../lib/speech";
import { PASSAGES } from "../data/passages";
import { part1Counts, part1Items } from "../components/Part1Hub";
import PackImage from "../components/PackImage";
import Icon from "../components/Icon";
import { useNav } from "../components/nav";
import { useAudioCount } from "../components/AudioPackImport";
import { cardLabel, sessionActive, sessionTitle } from "./PracticePage";

interface Props {
  state: AppState;
  update: Update;
  today: string;
}

const KIND_NAMES: [TrackKind, string][] = [
  ["listening", "无字幕听力"],
  ["part1", "Part 1 选图"],
  ["context", "新句理解"],
  ["text", "文字回忆"],
  ["spelling", "拼写"],
];

/** 今日：先给出今天的任务和主操作（继续学习 / 开始今日学习），再是专项快捷入口和设置 */
export default function TodayPage({ state, update, today }: Props) {
  const nav = useNav();
  const deck = state.settings.deck;

  if (!state.order.length) {
    return (
      <section className="page">
        <h2>今日学习</h2>
        <div className="hero">
          <p className="muted">还没有词库</p>
          <p>先到「词库」导入你的 Word 生词本（.docx），或托业 Part 1 图片包，再回来开始学习。</p>
          <button type="button" className="btn-primary" onClick={() => nav.go({ tab: "library", sub: "import" })}>
            去导入生词本 <Icon name="arrow-right" />
          </button>
        </div>
      </section>
    );
  }

  const scoped = scopeState(state, deck);
  const active = sessionActive(state, today);
  const exclude: TrackKind[] | undefined = deck === "toefl" ? ["part1"] : undefined;
  const due = dueTracks(scoped, today).filter((t) => !exclude?.includes(t.kind));
  const quota = newQuota(state, today);
  const fresh = Math.min(quota, newCandidates(scoped).length);
  const steps = buildQueue(scoped, today, { quota, exclude }).length;
  const finishedToday = state.session?.day === today && !active && (state.session?.queue.length ?? 0) > 0 && state.session?.scope !== "part1";
  const p1 = deck === "toefl" ? null : part1Counts(scoped, today);
  // 明天会到期的复习：今天新学的都会在明天第一次复习
  const tomorrowDue = dueTracks(scoped, addDays(today, 1)).filter((t) => !exclude?.includes(t.kind) && (t.due ?? "") > today).length;
  const left = newCandidates(scoped).length;
  const sample = p1 && p1.phrases ? part1Items(scoped).find((x) => x.sense.part1?.image) : undefined;

  const start = () => {
    update((st) => ({
      ...st,
      session: { day: today, deck, scope: "daily", index: 0, queue: buildQueue(scopeState(st, deck), today, { quota: newQuota(st, today), exclude }) },
    }));
    nav.openPractice();
  };
  // 继续学习：直接回到上次的题和作答阶段（不改变当前的词库筛选）
  const resume = () => nav.openPractice();

  return (
    <section className="page">
      <h2>今日学习</h2>

      {active ? (
        <div className="hero" data-testid="today-hero">
          <p className="muted">继续学习 · {sessionTitle(active)}</p>
          <div className="count">
            {active.index + 1}
            <span>/ {active.queue.length} 张</span>
          </div>
          <p className="muted small">
            下一张：{cardLabel(active.queue[active.index])}
            {active.ui?.cardId === active.queue[active.index]?.id &&
              Object.keys(active.ui.data).some((k) => k !== "order") &&
              " · 已作答到一半，会回到原来的阶段"}
            {(active.deck ?? "all") !== deck && ` · 这一轮来自${DECK_NAME[active.deck ?? "all"]}词库`}
          </p>
          <button type="button" className="btn-primary" onClick={resume}>
            继续学习 <Icon name="arrow-right" />
          </button>
        </div>
      ) : (
        <div className="hero" data-testid="today-hero">
          {finishedToday && <p className="good-text small">✓ 今天这一轮已经完成</p>}
          <p className="muted">今日任务{deck !== "all" && ` · ${DECK_NAME[deck]}词库`}</p>
          <div className="hero-counts">
            <div>
              <div className="count">{due.length}</div>
              <p className="muted small">待复习</p>
            </div>
            <div>
              <div className="count">{fresh}</div>
              <p className="muted small">新学义项</p>
            </div>
            <div>
              <div className="count">{steps}</div>
              <p className="muted small">实际步骤</p>
            </div>
          </div>
          <p className="muted small">
            {fresh > 0 ? `${fresh} 个新义项产生 ${fresh * 2} 步（含稍后回忆）；` : ""}
            {due.length > 0
              ? KIND_NAMES.map(([k, n]) => [n, due.filter((t) => t.kind === k).length] as const)
                  .filter(([, c]) => c)
                  .map(([n, c]) => `${n} ${c}`)
                  .join(" · ")
              : "今天没有到期的复习"}
          </p>
          <p className="muted small" data-testid="today-forecast">
            还有 {left} 个义项没学
            {fresh > 0 && `，按每天 ${state.settings.newPerDay} 个约 ${Math.ceil(left / Math.max(1, state.settings.newPerDay))} 天学完`}
            ；明天已排定复习 {tomorrowDue} 张{fresh > 0 ? `，学完今天的新词后会再增加约 ${fresh} 张` : ""}。
          </p>
          <button type="button" className="btn-primary" disabled={steps === 0} onClick={start}>
            {steps === 0 ? "今天没有要学的了" : "开始今日学习"} {steps > 0 && <Icon name="arrow-right" />}
          </button>
        </div>
      )}

      <div className="row spread">
        <span className="section-title">专项练习</span>
        <button type="button" className="btn-plain" onClick={() => nav.go({ tab: "training" })}>
          查看全部
        </button>
      </div>
      {p1 && (
        <div className="feature row" data-testid="part1-entry">
          {sample && <PackImage image={sample.sense.part1!.image} alt="Part 1 学习配图" className="mini-photo" compact />}
          <div className="feature-copy">
            <h3>听到动作，认出画面</h3>
            <p className="muted small">
              {p1.phrases
                ? `托业 Part 1 · 配图 ${p1.phrases} · 听音选图 ${p1.questions} 题${p1.due ? ` · 待复习 ${p1.due}` : ""}`
                : "托业 Part 1 · 还没有导入图片包"}
            </p>
          </div>
          <button
            type="button"
            className="arrow"
            aria-label="进入 Part 1 专项"
            onClick={() => (p1.phrases ? nav.go({ tab: "training", sub: "part1" }) : nav.go({ tab: "library", sub: "import-part1" }))}
          >
            <Icon name="arrow-right" />
          </button>
        </div>
      )}
      <div className="feature row">
        <div className="feature-copy">
          <h3>在短文中补全单词</h3>
          <p className="muted small">托福阅读 · {PASSAGES.length} 篇短文</p>
        </div>
        <button type="button" className="arrow" aria-label="进入托福补词" onClick={() => nav.go({ tab: "training", sub: "toefl" })}>
          <Icon name="arrow-right" />
        </button>
      </div>

      <Settings state={state} update={update} />
    </section>
  );
}

function Settings({ state, update }: { state: AppState; update: Update }) {
  const s = state.settings;
  const set = (patch: Partial<AppState["settings"]>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  return (
    <details className="settings">
      <summary>学习设置</summary>
      <label className="setting">
        <input type="checkbox" checked={s.commuteMode} onChange={(e) => set({ commuteMode: e.target.checked })} />
        <span>
          <b>通勤模式</b>：不点选项，在心里作答后点按钮自评
        </span>
      </label>
      <label className="setting">
        <span>每天新学义项（所有词库合计）</span>
        <input
          type="number"
          min={0}
          max={500}
          value={s.newPerDay}
          onChange={(e) => set({ newPerDay: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })}
        />
      </label>
      <label className="setting">
        <span>语速 {s.rate.toFixed(2)}</span>
        <input type="range" min={0.6} max={1.2} step={0.05} value={s.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
      </label>
      <label className="setting">
        <input type="checkbox" checked={s.audioHandoff ?? isAppleMobile()} onChange={(e) => set({ audioHandoff: e.target.checked })} />
        <span>
          <b>播放时把耳机切到这台设备</b>：AirPods 同时连着 Mac 和 iPhone 时，点播放会先让耳机切过来（第一次播放约等 1 秒）
        </span>
      </label>
      <AiVoiceSetting state={state} update={update} />
      <VoicePicker state={state} update={update} />
      <p className="muted small">顺序：先听力（避免先看到文字），再 Part 1 选图、新句理解、文字回忆、拼写，最后学新词。初学后第 1、3、7 天复习。</p>
    </details>
  );
}

function AiVoiceSetting({ state, update }: { state: AppState; update: Update }) {
  const nav = useNav();
  const n = useAudioCount();
  return (
    <div className="setting-block">
      <label className="setting">
        <input
          type="checkbox"
          checked={state.settings.aiVoice !== false}
          onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, aiVoice: e.target.checked } }))}
        />
        <span>
          <b>优先使用 AI 语音</b>：本机已有 {n} 条 AI 合成语音（ElevenLabs，美 / 英 / 澳口音轮换）。有 AI 语音的句子播放音频，其余用下面的系统语音。
        </span>
      </label>
      {n === 0 && (
        <button type="button" className="btn-plain" onClick={() => nav.go({ tab: "library", sub: "import" })}>
          去「词库 → 导入 → AI 语音包」导入
        </button>
      )}
    </div>
  );
}

function VoicePicker({ state, update }: { state: AppState; update: Update }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [all, setAll] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const read = (fresh: boolean) => {
    setBusy(true);
    return (fresh ? refreshVoices() : loadVoices()).then((v) => {
      setAll(v.length);
      setVoices(englishVoices(v));
      setBusy(false);
      return v;
    });
  };
  useEffect(() => {
    let alive = true;
    loadVoices().then((v) => {
      if (!alive) return;
      setAll(v.length);
      setVoices(englishVoices(v));
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!speechSupported()) return <div className="banner error">当前浏览器不支持语音合成，听力题可改做文字题。</div>;
  if (voices === null) return <p className="muted small">正在读取系统语音…</p>;
  const name = (v: SpeechSynthesisVoice) => `${v.name} · ${v.lang}${voiceQuality(v) !== "standard" ? ` · ${QUALITY_LABEL[voiceQuality(v)]}` : ""}`;
  const using = currentVoice(state.settings.voiceURI);
  const good = voices.filter((v) => voiceQuality(v) !== "standard").length;
  return (
    <div className="voice-picker" data-testid="voice-picker">
      {voices.length === 0 ? (
        <div className="banner warn">没有找到英文语音。听力题会提示改做文字题。</div>
      ) : (
        <label className="setting">
          <span>英文语音</span>
          <select
            value={state.settings.voiceURI ?? ""}
            onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, voiceURI: e.target.value || undefined } }))}
          >
            <option value="">自动（优先高级版的美式语音）</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {name(v)}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted small">
        系统语音正在使用：{using ? name(using) : "系统默认"}。浏览器提供了 {all} 个语音，其中英文 {voices.length} 个、高级版或增强版 {good} 个。
      </p>
      <div className="row wrap">
        <button
          type="button"
          className="btn-secondary small"
          onClick={() => speak("The woman is reaching for a cup on the shelf.", speechOptions(state.settings)).then((r) => setMsg(r.ok ? null : r.reason))}
        >
          试听
        </button>
        <button
          type="button"
          className="btn-secondary small"
          disabled={busy}
          onClick={() => read(true).then((v) => setMsg(`已重新读取：共 ${v.length} 个语音，英文 ${englishVoices(v).length} 个。`))}
        >
          {busy ? "正在读取…" : "重新读取语音列表"}
        </button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
      {good === 0 && (
        <p className="muted small">
          下载了高级版语音但这里没有？先完全关掉网页再打开，或点「重新读取」。如果还是没有，说明 iOS 没有把这个语音提供给网页（Safari 会限制部分语音），只能用列表里已有的。
        </p>
      )}
      <details>
        <summary>浏览器提供的全部英文语音（排查用）</summary>
        <ul className="plain voice-list">
          {voices.map((v) => (
            <li key={v.voiceURI}>
              <b>{v.name}</b> · {v.lang} · {QUALITY_LABEL[voiceQuality(v)]}
              {v.localService ? " · 本机" : " · 联网"}
              <div className="muted small">{v.voiceURI}</div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
