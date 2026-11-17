import { useCallback, useEffect, useMemo } from "react";
import type { AppState, Card, Session } from "../types";
import type { Update } from "../store";
import { KIND_LABEL, advanceSession, findSense, introduce, recordAnswer, toGrade } from "../lib/scheduler";
import { contextChoices, listenChoices } from "../lib/questions";
import { resolveCardQuestion } from "../lib/part1";
import { spellingItems } from "../lib/spelling";
import ListeningCard from "../components/ListeningCard";
import ContextCard from "../components/ContextCard";
import TextCard from "../components/TextCard";
import LearnCard from "../components/LearnCard";
import SpellingCard from "../components/SpellingCard";
import Part1Card from "../components/Part1Card";
import { CardStateProvider } from "../components/session";
import { FocusLayout, useNav } from "../components/nav";
import Icon from "../components/Icon";

interface Props {
  state: AppState;
  update: Update;
  today: string;
}

export function sessionActive(state: AppState, today: string): Session | undefined {
  const s = state.session;
  return s && s.day === today && s.index < s.queue.length ? s : undefined;
}

export function sessionTitle(s: Session): string {
  return s.scope === "part1" ? (s.queue.some((c) => c.p1) ? "Part 1 · 练习题" : "Part 1 · 听音选图") : "今日学习";
}

export function cardLabel(c: Card | undefined): string {
  if (!c) return "";
  return c.type === "learn" ? "新学" : KIND_LABEL[c.type];
}

/** 专注练习页：会话里的当前题。退出后回到进入前的页面，会话保留，可以继续 */
export default function PracticePage({ state, update, today }: Props) {
  const nav = useNav();
  const active = sessionActive(state, today);
  if (!active) return <Finished state={state} today={today} />;
  return <Player state={state} update={update} today={today} session={active} onBack={nav.closePractice} />;
}

function Finished({ state, today }: { state: AppState; today: string }) {
  const nav = useNav();
  const s = state.session;
  const part1 = s?.scope === "part1";
  const done = s && s.day === today && s.queue.length > 0;
  return (
    <FocusLayout
      title={part1 ? "Part 1" : "今日学习"}
      onBack={nav.closePractice}
      actions={
        <button type="button" className="btn-primary" onClick={nav.closePractice}>
          {part1 ? "回到 Part 1 专项" : "回到今日"}
        </button>
      }
    >
      <div className="done-card">
        <span className="done-icon" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <h2>{done ? "这一轮完成了" : "没有进行中的练习"}</h2>
        <p className="muted">
          {done
            ? part1
              ? s!.queue.some((c) => c.p1)
                ? "练习题的结果单独记录，不进入复习排期，也不计入首听正确率。"
                : "答错的题已经安排到明天复习，本轮内的重做不计入首听正确率。"
              : "答错、看字幕才懂和没想起来的题已安排到明天。"
            : "从今日或专项开始一轮练习。"}
        </p>
        <div className="next-steps">
          <button type="button" className="btn-secondary" onClick={() => nav.go({ tab: "training" })}>
            去专项练习
          </button>
          <button type="button" className="btn-secondary" onClick={() => nav.go({ tab: "records" })}>
            查看学习记录
          </button>
        </div>
      </div>
    </FocusLayout>
  );
}

function Player({ state, update, today, session, onBack }: Props & { session: Session; onBack: () => void }) {
  const card: Card = session.queue[session.index];
  const found = findSense(state, card.entryId, card.senseId);
  const example = found?.sense.examples.find((x) => x.id === card.exampleId);
  const spItem = useMemo(
    () => (card.type === "spelling" ? spellingItems(state, card.entryId, card.senseId).find((i) => i.id === card.exampleId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );
  const p1q = useMemo(
    () => (card.type === "part1" ? resolveCardQuestion(state, card) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );
  // 词条或例句已被删除：跳过
  const broken =
    !found ||
    ((card.type === "listening" || card.type === "context") && !example) ||
    (card.type === "spelling" && !spItem) ||
    (card.type === "part1" && !p1q);
  const skip = useCallback(
    () =>
      update((st) =>
        st.session && st.session.queue[st.session.index]?.id === card.id ? { ...st, session: { ...st.session, index: st.session.index + 1, ui: undefined } } : st,
      ),
    [update, card.id],
  );
  useEffect(() => {
    if (broken) skip();
  }, [broken, skip]);
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

  // 作答阶段保存到会话：刷新或退出后回到同一题的同一阶段
  const cardState = useMemo(
    () => ({
      cardId: card.id,
      data: session.ui?.cardId === card.id ? session.ui.data : {},
      save: (key: string, value: unknown) =>
        update((st) => {
          const s = st.session;
          if (!s || s.queue[s.index]?.id !== card.id) return st;
          const data = s.ui?.cardId === card.id ? s.ui.data : {};
          return { ...st, session: { ...s, ui: { cardId: card.id, data: { ...data, [key]: value } } } };
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );

  if (broken) return null;
  const { entry, sense } = found!;
  const commute = state.settings.commuteMode;

  /** 提交一次作答：只对当前这张卡生效，连续点击、重复提交不会重复记录 */
  const answer = (
    result: Parameters<typeof recordAnswer>[1]["result"],
    extra: { plays?: number; audioFallback?: boolean; chosen?: string } = {},
  ) =>
    update((st) => {
      const s = st.session;
      if (!s || s.queue[s.index]?.id !== card.id) return st;
      const s1 = recordAnswer(st, { card, result, day: today, ...extra });
      const failed = !extra.audioFallback && toGrade(result) === "fail";
      return { ...s1, session: advanceSession(s, failed) };
    });

  const extra = (card.retry ? " · 重做" : "") + (card.free && !card.p1 ? " · 自由练习" : "");
  // Part 1 专项本身就是一种题型，标题不重复题型名
  const label = session.scope === "part1" ? sessionTitle(session) + extra : `${sessionTitle(session)} · ${cardLabel(card)}${extra}`;

  return (
    <FocusLayout
      title={label}
      progress={{ done: session.index, total: session.queue.length }}
      onBack={onBack}
    >
      <CardStateProvider value={cardState}>
        <div className="sr-only" aria-live="polite">
          第 {session.index + 1} / {session.queue.length} 张 · {KIND_LABEL[card.type as "text"] ?? "新学"}
        </div>
        {card.type === "learn" && (
          <LearnCard
            key={card.id}
            entry={entry}
            sense={sense}
            example={example}
            settings={state.settings}
            onDone={() =>
              update((st) => {
                const s = st.session;
                if (!s || s.queue[s.index]?.id !== card.id) return st;
                return { ...introduce(st, card.entryId, card.senseId, today), session: advanceSession(s, false) };
              })
            }
          />
        )}
        {card.type === "text" && <TextCard key={card.id} entry={entry} sense={sense} settings={state.settings} intro={card.intro} onDone={(r) => answer(r)} />}
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
        {card.type === "part1" && p1q && (
          <Part1Card
            key={card.id}
            question={p1q}
            settings={state.settings}
            onSkip={skip}
            onDone={(d) => answer(d.result, { plays: d.plays, audioFallback: d.audioFallback, chosen: d.chosen })}
          />
        )}
        {card.type === "spelling" && spItem && <SpellingCard key={card.id} entry={entry} sense={sense} item={spItem} onDone={(r) => answer(r)} />}
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
      </CardStateProvider>
    </FocusLayout>
  );
}
