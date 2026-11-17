import type { AppState } from "../types";
import type { Update } from "../store";
import { PASSAGES } from "../data/passages";
import { passageSummary } from "../lib/reading";
import Part1Hub, { Part1List, Part1Study, part1Counts } from "../components/Part1Hub";
import ReadingPage, { PassagePlayer } from "./ReadingPage";
import { useNav } from "../components/nav";
import Icon from "../components/Icon";
import { scopeState } from "../lib/decks";

/** Part 1 永远在托业上下文里 */
const P1_DECK = "toeic" as const;

/**
 * 专项：始终提供两个训练入口。
 *   托业 Part 1 → 看图学短语 / 听音选图 / 练习题
 *   托福补词 → 3 篇短文
 */
export default function TrainingPage({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const nav = useNav();
  const { sub, passage } = nav.route;

  if (sub === "toefl") {
    const p = PASSAGES.find((x) => x.id === passage);
    return p ? <PassagePlayer key={p.id} passage={p} state={state} update={update} today={today} /> : <ReadingPage state={state} />;
  }
  if (sub === "part1") return <Part1Hub state={state} update={update} today={today} deck={P1_DECK} />;
  if (sub === "part1-study") return <Part1Study state={state} update={update} deck={P1_DECK} />;
  if (sub === "part1-list") return <Part1List state={state} deck={P1_DECK} />;

  const p1 = part1Counts(scopeState(state, P1_DECK), today);
  const done = PASSAGES.filter((x) => passageSummary(state, x.id)).length;
  const drafts = PASSAGES.filter((x) => state.readingDrafts?.[x.id]?.some((v) => v.trim()));

  return (
    <section className="page">
      <h2>专项练习</h2>
      <div className="topic">
        <span className="pill">托业 Part 1</span>
        <h3 className="topic-title">把声音和画面联系起来</h3>
        <p className="muted">
          {p1.phrases ? `图文词条 ${p1.phrases} · 可判分听音题 ${p1.questions}${p1.due ? ` · 待复习 ${p1.due}` : ""}` : "还没有导入 Part 1 图片包"}
        </p>
        <button type="button" className="btn-primary" onClick={() => nav.go({ tab: "training", sub: "part1" })}>
          {p1.phrases ? (state.part1Study ? "继续看图学习" : "进入托业 Part 1") : "导入并开始"}
        </button>
        <details>
          <summary>包含的练习</summary>
          <p className="muted small">看图学短语：浏览配图，听句子，看中文义项和画面线索。</p>
          <p className="muted small">听音选图：播放英语句子后，选择匹配的图片，提交后展示解释。</p>
          <p className="muted small">练习题：用全部配图自动出题，可以指定题数，只算练习。</p>
        </details>
      </div>
      <div className="topic">
        <span className="pill">托福阅读</span>
        <h3 className="topic-title">补全单词</h3>
        <p className="muted">
          在上下文中练习词形与拼写 · {PASSAGES.length} 篇短文{done ? ` · 已做 ${done} 篇` : ""}
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => nav.go(drafts[0] ? { tab: "training", sub: "toefl", passage: drafts[0].id } : { tab: "training", sub: "toefl" })}
        >
          {drafts[0] ? `继续：${drafts[0].title}` : "开始补词"}
        </button>
        <details>
          <summary>查看 {PASSAGES.length} 篇短文</summary>
          {PASSAGES.map((x) => (
            <button key={x.id} type="button" className="list-link" onClick={() => nav.go({ tab: "training", sub: "toefl", passage: x.id })}>
              <span>{x.title}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          ))}
        </details>
      </div>
    </section>
  );
}
