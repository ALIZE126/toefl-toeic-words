import { useMemo, useState } from "react";
import type { AppState, DeckFilter, Entry, Sense } from "../types";
import type { Update } from "../store";
import { PART1_CATEGORIES, buildPart1Practice, part1Questions, practiceCount, sourceLabel } from "../lib/part1";
import { buildPart1Queue, trackKey, trackStatus } from "../lib/scheduler";
import { scopeState } from "../lib/decks";
import { speak, speechOptions } from "../lib/speech";
import PackImage from "./PackImage";
import ImageStatus from "./ImageStatus";
import { AudioPanel, Pill, SpeakButton } from "./common";
import { FocusLayout, useNav } from "./nav";
import { ActionBar } from "./session";
import Icon from "./Icon";

type Item = { entry: Entry; sense: Sense };

export function part1Items(state: AppState): Item[] {
  const out: Item[] = [];
  for (const id of state.order) {
    const entry = state.entries[id];
    for (const sense of entry?.senses ?? []) if (sense.part1) out.push({ entry, sense });
  }
  return out;
}

export function part1Counts(state: AppState, today: string) {
  const qs = part1Questions(state);
  const tracks = Object.values(state.tracks).filter((t) => t.kind === "part1");
  const started = new Set(tracks.map((t) => t.senseId));
  return {
    phrases: part1Items(state).length,
    questions: qs.length,
    due: tracks.filter((t) => trackStatus(t, today) === "due" && qs.some((q) => q.senseId === t.senseId)).length,
    fresh: new Set(qs.filter((q) => !started.has(q.senseId)).map((q) => q.senseId)).size,
  };
}

interface Props {
  state: AppState;
  update: Update;
  today: string;
  /** 专项里的 Part 1 始终是托业上下文 */
  deck: DeckFilter;
}

/** 专项 → 托业 Part 1：看图学短语（配图数）和听音选图（可判分题数）分开呈现 */
export default function Part1Hub({ state, update, today, deck }: Props) {
  const nav = useNav();
  const scoped = scopeState(state, deck);
  const c = part1Counts(scoped, today);
  const study = state.part1Study;
  const [cat, setCat] = useState<string>("all");
  const category = cat === "all" ? undefined : cat;
  const savedCount = state.settings.part1PracticeCount ?? 10;
  const [countText, setCountText] = useState(savedCount ? String(savedCount) : "");
  const available = practiceCount(scoped, category);
  const want = savedCount === 0 ? available : Math.min(savedCount, available);
  const setCount = (n: number) => {
    setCountText(n ? String(n) : "");
    update((st) => ({ ...st, settings: { ...st.settings, part1PracticeCount: n } }));
  };

  const startQueue = (practice: boolean) => {
    update((st) => ({
      ...st,
      session: {
        day: today,
        deck,
        scope: "part1",
        index: 0,
        queue: practice
          ? buildPart1Practice(scopeState(st, deck), { count: st.settings.part1PracticeCount ?? 10, category })
          : buildPart1Queue(scopeState(st, deck), today),
      },
    }));
    nav.openPractice();
  };

  if (c.phrases === 0) {
    return (
      <section className="page">
        <BackLink />
        <h2>托业 Part 1</h2>
        <div className="topic">
          <h3>还没有导入 Part 1 图片词库</h3>
          <p className="muted">到「词库 → 导入 → Part 1 图片包」选择 toeic-part1-image-pack.zip，会直接导入到托业词库。</p>
          <button type="button" className="btn-primary" onClick={() => nav.go({ tab: "library", sub: "import-part1" })}>
            去导入图片包
          </button>
        </div>
      </section>
    );
  }

  const studyIndex = Math.min(study?.index ?? 0, c.phrases - 1);
  return (
    <section className="page">
      <BackLink />
      <h2>托业 Part 1</h2>
      <p className="muted small">训练听到动作或状态短语后，马上在照片里认出对应的画面。</p>
      <ImageStatus state={state} />

      <div className="topic">
        <span className="pill">看图学短语</span>
        <h3 className="topic-title">把声音和画面联系起来</h3>
        <p className="muted">
          配图 {c.phrases} 张{study ? ` · 上次看到第 ${studyIndex + 1} 张` : ""}
        </p>
        <button type="button" className="btn-primary" onClick={() => nav.go({ tab: "training", sub: "part1-study" })}>
          {study ? "继续看图学习" : "开始看图学习"}
        </button>
        <button type="button" className="btn-plain" onClick={() => nav.go({ tab: "training", sub: "part1-list" })}>
          浏览全部短语
        </button>
      </div>

      <div className="topic">
        <span className="pill">听音选图</span>
        <h3 className="topic-title">听一句话，选出匹配的图片</h3>
        <p className="muted">
          可判分 {c.questions} 题{c.questions > 0 && ` · 待复习 ${c.due} · 新题 ${c.fresh}`}
        </p>
        {c.questions === 0 ? (
          <p className="muted small">图片包里还没有通过校验的对照题，其余图片先在「看图学短语」里学习。</p>
        ) : (
          <button type="button" className="btn-primary" disabled={c.due + c.fresh === 0} onClick={() => startQueue(false)}>
            {c.due + c.fresh === 0 ? "今天没有要复习的审核题" : `开始听音选图（${c.due + c.fresh} 题）`}
          </button>
        )}
        <details>
          <summary>规则</summary>
          <p className="muted small">
            只有配好对照图、并确认同一句话只匹配其中一张图的题，才进入正式复习：第 1、3、7 天复习，答错的次日再考，本轮内隔几题重做。
          </p>
        </details>
      </div>

      <div className="topic" data-testid="part1-practice">
        <span className="pill">练习题 · 自动出题</span>
        <h3 className="topic-title">多练几张图</h3>
        <p className="muted small">
          用每张图的场景句播报，再配一张别的短语的图做干扰。干扰图没有逐题审核，所以只算练习：不进复习排期，也不计入首听正确率。没练过的短语优先出。
        </p>
        <div className="field">
          <span className="field-label">范围</span>
          <div className="filters">
            {["all", ...PART1_CATEGORIES].map((x) => (
              <button key={x} type="button" className="filter" aria-pressed={cat === x} onClick={() => setCat(x)}>
                {x === "all" ? "全部" : x} {practiceCount(scoped, x === "all" ? undefined : x)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">本轮题数</span>
          <div className="filters">
            {[5, 10, 20, 0].map((n) => (
              <button key={n} type="button" className="filter" aria-pressed={savedCount === n} onClick={() => setCount(n)}>
                {n === 0 ? "全部" : n}
              </button>
            ))}
            <input
              className="count-input"
              type="number"
              min={1}
              max={available}
              inputMode="numeric"
              aria-label="自定义题数"
              placeholder="自定义"
              value={countText}
              onChange={(e) => {
                setCountText(e.target.value);
                const n = Math.floor(Number(e.target.value));
                if (n >= 1) update((st) => ({ ...st, settings: { ...st.settings, part1PracticeCount: n } }));
              }}
            />
          </div>
        </div>
        <button type="button" className="btn-primary" disabled={available === 0} onClick={() => startQueue(true)}>
          开始练习（{want} 题）
        </button>
      </div>
    </section>
  );
}

function BackLink() {
  const nav = useNav();
  return (
    <button type="button" className="back" onClick={() => nav.go({ tab: "training" })}>
      <Icon name="chevron-left" />
      专项
    </button>
  );
}

/* ───────────── 看图学习（专注页） ───────────── */

/** 看图学短语：一张一张看，先听句子、看画面，再查看释义；位置保存在 part1Study，下次继续 */
export function Part1Study({ state, update, deck }: { state: AppState; update: Update; deck: DeckFilter }) {
  const nav = useNav();
  const items = useMemo(() => part1Items(scopeState(state, deck)), [state, deck]);
  const index = Math.min(state.part1Study?.index ?? 0, Math.max(0, items.length - 1));
  const [revealed, setRevealed] = useState(false);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = items[index];
  const back = () => nav.go({ tab: "training", sub: "part1" });
  if (!item) {
    back();
    return null;
  }
  const p = item.sense.part1!;
  const sentence = p.image?.sceneEn ?? p.sources[0]?.sentence ?? item.entry.word;
  const setIndex = (i: number) => {
    setRevealed(false);
    setPlays(0);
    setError(null);
    update((st) => ({ ...st, part1Study: { index: i } }));
  };
  const play = async (slow?: boolean) => {
    setPlaying(true);
    const r = await speak(sentence, speechOptions(state.settings, slow));
    setPlaying(false);
    if (r.ok) setPlays((n) => n + 1);
    setError(r.ok ? null : r.reason);
  };
  const last = index >= items.length - 1;
  return (
    <FocusLayout title="Part 1 · 看图学习" progress={{ done: index, total: items.length, label: `${index + 1} / ${items.length}` }} onBack={back}>
      <div className="study">
        <PackImage image={p.image} alt={revealed ? `${item.entry.word} 配图` : "本题的场景图片"} className="photo" zoomable />
        <AudioPanel plays={plays} playing={playing} onPlay={play} />
        {error && (
          <div className="banner error" role="alert">
            无法播放语音：{error}
            <span className="muted small">可以先查看释义，读出下面的句子。</span>
          </div>
        )}
        {revealed && (
          <div className="answer">
            <h3>{item.entry.word}</h3>
            <p>{item.sense.gloss}</p>
            <p className="sentence">
              {sentence} <SpeakButton text={sentence} settings={state.settings} />
            </p>
            {p.image?.cue && <p className="cue">{p.image.cue}</p>}
            <details>
              <summary>线索、注意事项与出处</summary>
              <Part1Details entry={item.entry} sense={item.sense} state={state} hideImage />
            </details>
          </div>
        )}
      </div>
      <ActionBar className={index > 0 && !revealed ? "two" : ""}>
        {index > 0 && !revealed && (
          <button type="button" className="btn-secondary" onClick={() => setIndex(index - 1)}>
            上一张
          </button>
        )}
        {!revealed ? (
          <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
            查看释义
          </button>
        ) : last ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              update((st) => ({ ...st, part1Study: { index: 0 } }));
              back();
            }}
          >
            完成本组
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setIndex(index + 1)}>
            继续学习
          </button>
        )}
      </ActionBar>
    </FocusLayout>
  );
}

/* ───────────── 全部短语列表 ───────────── */

const PAGE = 24;

export function Part1List({ state, deck }: { state: AppState; deck: DeckFilter }) {
  const nav = useNav();
  const all = useMemo(() => part1Items(scopeState(state, deck)), [state, deck]);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter(
      ({ entry, sense }) => (cat === "all" || sense.part1!.categories.includes(cat)) && (!kw || entry.word.toLowerCase().includes(kw) || sense.gloss.includes(kw)),
    );
  }, [all, cat, q]);

  if (open !== null && list[open]) {
    return (
      <PhraseDetail
        item={list[open]}
        state={state}
        pos={`${open + 1} / ${list.length}`}
        onBack={() => {
          setOpen(null);
          requestAnimationFrame(() => window.scrollTo?.(0, scrollY));
        }}
        onPrev={open > 0 ? () => setOpen(open - 1) : undefined}
        onNext={open + 1 < list.length ? () => setOpen(open + 1) : undefined}
      />
    );
  }

  return (
    <section className="page">
      <button type="button" className="back" onClick={() => nav.go({ tab: "training", sub: "part1" })}>
        <Icon name="chevron-left" />
        托业 Part 1
      </button>
      <h2>全部短语</h2>
      <label className="sr-only" htmlFor="p1-search">
        搜索短语或中文
      </label>
      <input id="p1-search" className="search" type="search" placeholder="搜索短语或中文" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="filters" aria-label="类别筛选">
        {["all", ...PART1_CATEGORIES].map((c) => (
          <button key={c} type="button" className="filter" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === "all" ? "全部" : c} {c === "all" ? all.length : all.filter((x) => x.sense.part1!.categories.includes(c)).length}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="muted small">没有匹配的短语</p>}
      <div className="p1-grid">
        {list.slice(0, limit).map((it, i) => (
          <button
            key={it.sense.id}
            type="button"
            className="p1-tile"
            onClick={() => {
              setScrollY(window.scrollY);
              setOpen(i);
            }}
          >
            <PackImage image={it.sense.part1!.image} alt={it.entry.word} compact />
            <b>{it.entry.word}</b>
            <span className="muted small">{it.sense.gloss}</span>
          </button>
        ))}
      </div>
      {list.length > limit && (
        <button type="button" className="btn-secondary wide" onClick={() => setLimit(limit + PAGE)}>
          再显示 {Math.min(PAGE, list.length - limit)} 个（共 {list.length}）
        </button>
      )}
    </section>
  );
}

export function Part1Details({ entry, sense, state, hideImage }: Item & { state: AppState; hideImage?: boolean }) {
  const p = sense.part1!;
  const scene = p.image?.sceneEn;
  return (
    <div className="p1-detail">
      {!hideImage && <PackImage image={p.image} alt={`${entry.word} 配图`} className="photo" zoomable />}
      <div className="row wrap">
        {p.categories.map((c) => (
          <Pill key={c} tone="info">
            {c}
          </Pill>
        ))}
        <Pill>Part 1 · {p.phraseId}</Pill>
        {p.image?.matchQuality === "paired_photo_reviewed" && <Pill tone="good">已配对照图</Pill>}
      </div>
      {scene && !hideImage && (
        <p className="row wrap">
          <span>
            画面：<i>{scene}</i>
          </span>
          <SpeakButton text={scene} settings={state.settings} />
        </p>
      )}
      {(p.image?.cue || p.visualClues.length > 0) && (
        <div className="note">
          <b>画面线索</b>
          {p.image?.cue && !hideImage && <p>这张图：{p.image.cue}</p>}
          {p.visualClues.map((c, i) => (
            <p key={i}>· {c}</p>
          ))}
        </div>
      )}
      {(p.image?.caution || p.visualCautions.length > 0) && (
        <div className="note warn">
          <b>注意</b>
          {[p.image?.caution, ...p.visualCautions].filter(Boolean).map((c, i) => (
            <p key={i}>· {c}</p>
          ))}
        </div>
      )}
      {p.observedForms.length > 0 && <p className="muted small">题目里的形式：{p.observedForms.join(" ｜ ")}</p>}
      {p.sources.length > 0 && (
        <div>
          <b>原题出处</b>
          <ul className="plain">
            {p.sources.map((s) => (
              <li key={s.sourceId}>
                <SpeakButton text={s.sentence} settings={state.settings} /> {s.sentence}
                <div className="muted small">
                  {sourceLabel(s)}
                  {s.pdfFile && ` · ${s.pdfFile}${s.pdfPage ? ` 第 ${s.pdfPage} 页` : ""}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.trainingNote && <p className="muted small">{p.trainingNote}</p>}
    </div>
  );
}

function PhraseDetail({
  item,
  state,
  pos,
  onBack,
  onPrev,
  onNext,
}: {
  item: Item;
  state: AppState;
  pos: string;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { entry, sense } = item;
  const t = state.tracks[trackKey(sense.id, "part1")];
  return (
    <section className="page">
      <div className="row spread">
        <button type="button" className="back" onClick={onBack}>
          <Icon name="chevron-left" />
          返回图片列表
        </button>
        <span className="muted small">{pos}</span>
      </div>
      <div className="headword">
        <h2 className="word">{entry.word}</h2>
        <SpeakButton text={entry.word} settings={state.settings} />
      </div>
      <p className="lead">{sense.gloss}</p>
      {t && <p className="muted small">听音选图进度：第 {t.stage} 级{t.due ? `，下次 ${t.due}` : "，已掌握"}</p>}
      <Part1Details entry={entry} sense={sense} state={state} />
      <div className="row two-btn">
        <button type="button" className="btn-secondary" disabled={!onPrev} onClick={onPrev}>
          上一个
        </button>
        <button type="button" className="btn-primary" disabled={!onNext} onClick={onNext}>
          下一个
        </button>
      </div>
    </section>
  );
}
