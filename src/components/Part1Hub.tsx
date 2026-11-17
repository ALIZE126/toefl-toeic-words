import { useMemo, useState } from "react";
import type { AppState, DeckFilter, Entry, Sense } from "../types";
import type { Update } from "../store";
import { PART1_CATEGORIES, buildPart1Practice, part1Questions, practiceCount, sourceLabel } from "../lib/part1";
import { buildPart1Queue, trackKey, trackStatus } from "../lib/scheduler";
import { scopeState } from "../lib/decks";
import PackImage from "./PackImage";
import { Pill, SpeakButton } from "./common";

interface Props {
  state: AppState;
  update: Update;
  today: string;
  deck: DeckFilter;
  onBack: () => void;
  /** 刚做完一轮听音选图 */
  finished?: boolean;
}

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

export default function Part1Hub({ state, update, today, deck, onBack, finished }: Props) {
  const [view, setView] = useState<"home" | "browse">("home");
  const scoped = scopeState(state, deck);
  const c = part1Counts(scoped, today);

  const start = () =>
    update((st) => ({
      ...st,
      session: { day: today, deck, scope: "part1", index: 0, queue: buildPart1Queue(scopeState(st, deck), today) },
    }));
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
  const startPractice = () =>
    update((st) => ({
      ...st,
      session: {
        day: today,
        deck,
        scope: "part1",
        index: 0,
        queue: buildPart1Practice(scopeState(st, deck), { count: st.settings.part1PracticeCount ?? 10, category }),
      },
    }));

  if (view === "browse") return <Browse state={scoped} onBack={() => setView("home")} />;

  return (
    <section className="stack">
      <div className="panel">
        <button className="btn ghost small" onClick={onBack}>
          ← 返回今日复习
        </button>
        <h2>托业 Part 1 专项</h2>
        <p className="hint">训练听到动作或状态短语后，马上在照片里认出对应的画面。</p>
      </div>
      {finished && (
        <div className="panel done">
          <h3>🎉 这一轮听音选图做完了</h3>
          <p>
            {state.session?.queue.some((c) => c.p1)
              ? "练习题的结果单独记录，不进入复习排期，也不计入首听正确率。"
              : "答错的题已经安排到明天复习，本轮内的重做不计入首听正确率。"}
          </p>
        </div>
      )}
      {c.phrases === 0 ? (
        <div className="panel center">
          <h3>还没有导入 Part 1 图片词库</h3>
          <p>到「词库」，顶部切到「托业」，点「导入 Part 1 图片词库」，选择 toeic-part1-image-pack.zip。</p>
        </div>
      ) : (
        <>
          <div className="panel p1-entry">
            <h3>📷 看图学短语</h3>
            <p className="hint">浏览全部 {c.phrases} 张配图，听短语或例句，看中文义项和画面线索。</p>
            <button className="btn primary" onClick={() => setView("browse")}>
              开始看图学短语
            </button>
          </div>
          <div className="panel p1-entry">
            <h3>🎧 听音选图</h3>
            <p className="hint">
              播放一句英文，从两张图里选出匹配的一张。可判分的题 {c.questions} 道
              {c.questions > 0 && `：待复习 ${c.due}，新题 ${c.fresh}`}。
            </p>
            {c.questions === 0 ? (
              <p className="hint">图片包里还没有通过校验的对照题。其余图片先在「看图学短语」里学习。</p>
            ) : (
              <div className="row">
                <button className="btn primary" disabled={c.due + c.fresh === 0} onClick={start}>
                  {c.due + c.fresh === 0 ? "今天没有要复习的审核题" : `开始听音选图（${c.due + c.fresh} 题）`}
                </button>
              </div>
            )}
            <p className="hint">只有配好对照图、并确认同一句话只匹配其中一张图的题，才进入正式复习。第 1、3、7 天复习，答错的次日再考。</p>
          </div>
          <div className="panel p1-entry" data-testid="part1-practice">
            <h3>🎲 练习题（自动出题）</h3>
            <p className="hint">
              用每张图的场景句播报，再配一张别的短语的图做干扰：优先用审核过的对照图和「可做受控对照」的组，其次用类别不同的短语。干扰图没有逐题审核，所以只算练习：不进第
              1、3、7 天复习，也不计入首听正确率。没练过的短语优先出。
            </p>
            <div className="field">
              <span>范围</span>
              <div className="seg">
                {["all", ...PART1_CATEGORIES].map((x) => (
                  <button key={x} className={cat === x ? "seg-btn active" : "seg-btn"} onClick={() => setCat(x)}>
                    {x === "all" ? "全部" : x} {practiceCount(scoped, x === "all" ? undefined : x)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>本轮题数</span>
              <div className="seg">
                {[5, 10, 20, 0].map((n) => (
                  <button key={n} className={savedCount === n ? "seg-btn active" : "seg-btn"} onClick={() => setCount(n)}>
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
            <button className="btn primary" disabled={available === 0} onClick={startPractice}>
              开始练习（{want} 题）
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const PAGE = 24;

function Browse({ state, onBack }: { state: AppState; onBack: () => void }) {
  const all = useMemo(() => part1Items(state), [state]);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter(
      ({ entry, sense }) =>
        (cat === "all" || sense.part1!.categories.includes(cat)) &&
        (!kw || entry.word.toLowerCase().includes(kw) || sense.gloss.includes(kw)),
    );
  }, [all, cat, q]);

  if (open !== null && list[open]) {
    return (
      <PhraseDetail
        item={list[open]}
        state={state}
        pos={`${open + 1} / ${list.length}`}
        onBack={() => setOpen(null)}
        onPrev={open > 0 ? () => setOpen(open - 1) : undefined}
        onNext={open + 1 < list.length ? () => setOpen(open + 1) : undefined}
      />
    );
  }

  return (
    <section className="stack">
      <div className="panel">
        <button className="btn ghost small" onClick={onBack}>
          ← 返回 Part 1 专项
        </button>
        <h2>看图学短语</h2>
        <div className="filters">
          <input className="search" placeholder="搜索短语或中文" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">
            {["all", ...PART1_CATEGORIES].map((c) => (
              <button key={c} className={cat === c ? "seg-btn active" : "seg-btn"} onClick={() => setCat(c)}>
                {c === "all" ? "全部" : c} {c === "all" ? all.length : all.filter((x) => x.sense.part1!.categories.includes(c)).length}
              </button>
            ))}
          </div>
        </div>
        <div className="p1-grid">
          {list.slice(0, limit).map((it, i) => (
            <button key={it.sense.id} className="p1-tile" onClick={() => setOpen(i)}>
              <PackImage image={it.sense.part1!.image} alt={it.entry.word} compact />
              <b>{it.entry.word}</b>
              <span className="hint">{it.sense.gloss}</span>
            </button>
          ))}
        </div>
        {list.length > limit && (
          <button className="btn wide" onClick={() => setLimit(limit + PAGE)}>
            再显示 {Math.min(PAGE, list.length - limit)} 个（共 {list.length}）
          </button>
        )}
      </div>
    </section>
  );
}

export function Part1Details({ entry, sense, state }: Item & { state: AppState }) {
  const p = sense.part1!;
  const scene = p.image?.sceneEn;
  return (
    <div className="p1-detail">
      <PackImage image={p.image} alt={`${entry.word} 配图`} className="big" />
      <div className="row">
        {p.categories.map((c) => (
          <Pill key={c} tone="info">
            {c}
          </Pill>
        ))}
        <Pill>Part 1 · {p.phraseId}</Pill>
        {p.image?.matchQuality === "paired_photo_reviewed" && <Pill tone="good">已配对照图</Pill>}
      </div>
      {scene && (
        <div className="row">
          <span>
            画面：<i>{scene}</i>
          </span>
          <SpeakButton text={scene} settings={state.settings} label="🔊" />
        </div>
      )}
      {(p.image?.cue || p.visualClues.length > 0) && (
        <div className="fb-clue">
          <b>画面线索</b>
          {p.image?.cue && <div>这张图：{p.image.cue}</div>}
          {p.visualClues.map((c, i) => (
            <div key={i}>· {c}</div>
          ))}
        </div>
      )}
      {(p.image?.caution || p.visualCautions.length > 0) && (
        <div className="banner warn">
          <b>注意</b>
          {[p.image?.caution, ...p.visualCautions].filter(Boolean).map((c, i) => (
            <div key={i}>· {c}</div>
          ))}
        </div>
      )}
      {p.observedForms.length > 0 && <div className="hint">题目里的形式：{p.observedForms.join(" ｜ ")}</div>}
      {p.sources.length > 0 && (
        <div>
          <b>原题出处</b>
          <ul className="plain">
            {p.sources.map((s) => (
              <li key={s.sourceId}>
                <SpeakButton text={s.sentence} settings={state.settings} label="🔊" /> {s.sentence}
                <div className="hint">
                  {sourceLabel(s)}
                  {s.pdfFile && ` · ${s.pdfFile}${s.pdfPage ? ` 第 ${s.pdfPage} 页` : ""}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.trainingNote && <div className="hint">{p.trainingNote}</div>}
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
    <section className="stack">
      <div className="panel">
        <div className="row">
          <button className="btn ghost small" onClick={onBack}>
            ← 返回图片列表
          </button>
          <span className="hint">{pos}</span>
        </div>
        <div className="headword">
          {entry.word}
          <SpeakButton text={entry.word} settings={state.settings} />
        </div>
        <div className="gloss big">{sense.gloss}</div>
        {t && <div className="hint">听音选图进度：第 {t.stage} 级{t.due ? `，下次 ${t.due}` : "，已掌握"}</div>}
        <Part1Details entry={entry} sense={sense} state={state} />
        <div className="actions">
          <button className="btn" disabled={!onPrev} onClick={onPrev}>
            ← 上一个
          </button>
          <button className="btn primary" disabled={!onNext} onClick={onNext}>
            下一个 →
          </button>
        </div>
      </div>
    </section>
  );
}
