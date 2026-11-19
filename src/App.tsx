import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import TodayPage from "./pages/TodayPage";
import TrainingPage from "./pages/TrainingPage";
import LibraryPage from "./pages/LibraryPage";
import StatsPage from "./pages/StatsPage";
import PracticePage from "./pages/PracticePage";
import { getToday, toDay } from "./lib/util";
import { DECK_NAME, deckCount } from "./lib/decks";
import type { DeckFilter } from "./types";
import { useAvoidHostBadge } from "./lib/hostBadge";
import { loadAudioIndex } from "./lib/audioStore";
import Icon, { type IconName } from "./components/Icon";
import { FocusProvider, NavCtx, TAB_LABEL, type Nav, type Route, type Tab } from "./components/nav";

const TABS: { id: Tab; icon: IconName }[] = [
  { id: "today", icon: "house" },
  { id: "training", icon: "headphones" },
  { id: "library", icon: "book" },
  { id: "records", icon: "chart" },
];

export default function App() {
  const { state, update, saveError } = useStore();
  useAvoidHostBadge();
  const [route, setRoute] = useState<Route>({ tab: "today" });
  const [practice, setPractice] = useState<{ open: boolean; returnTo: Route }>({ open: false, returnTo: { tab: "today" } });
  const [focus, setFocus] = useState(false);
  const today = getToday();
  const realToday = today === toDay();

  const go = useCallback((r: Route) => {
    setPractice((p) => ({ ...p, open: false }));
    setRoute(r);
    window.scrollTo?.(0, 0);
  }, []);

  const nav: Nav = useMemo(
    () => ({
      route,
      go,
      practiceOpen: practice.open,
      openPractice: () => setPractice({ open: true, returnTo: route }),
      closePractice: () => {
        setPractice((p) => {
          setRoute(p.returnTo);
          return { ...p, open: false };
        });
      },
    }),
    [route, go, practice.open],
  );

  // 启动时读取本机的 AI 语音索引，之后播放时同步判断有没有这句的音频
  useEffect(() => {
    void loadAudioIndex();
  }, []);

  // 其他组件请求跳转（例如图片缺失时「重新关联图片包」）
  useEffect(() => {
    const onNav = (e: Event) => {
      const to = (e as CustomEvent<{ to: string }>).detail?.to;
      if (to === "import-part1") {
        update((st) => ({ ...st, settings: { ...st.settings, deck: "toeic" } }));
        go({ tab: "library", sub: "import-part1" });
      }
    };
    window.addEventListener("app:navigate", onNav);
    return () => window.removeEventListener("app:navigate", onNav);
  }, [go, update]);

  const deck = state.settings.deck;
  const setDeck = (d: DeckFilter) => update((st) => ({ ...st, settings: { ...st.settings, deck: d } }));
  const hasWords = state.order.length > 0;

  return (
    <NavCtx.Provider value={nav}>
      <FocusProvider value={setFocus}>
        <div className={focus ? "app focus-mode" : "app"}>
          {!focus && (
            <header className="chrome">
              <div>
                <div className="brand">生词复习</div>
                <p className="kicker">托业 · 托福</p>
              </div>
              <nav className="top-nav" aria-label="主要导航">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="top-nav-item"
                    aria-current={route.tab === t.id ? "page" : undefined}
                    onClick={() => go({ tab: t.id })}
                  >
                    {TAB_LABEL[t.id]}
                  </button>
                ))}
              </nav>
              {hasWords && (
                <label className="deck-select">
                  <span className="sr-only">词库范围</span>
                  <select value={deck} onChange={(e) => setDeck(e.target.value as DeckFilter)} aria-label="词库范围">
                    {(["all", "toefl", "toeic"] as DeckFilter[]).map((d) => (
                      <option key={d} value={d}>
                        {d === "all" ? "全部词库" : `${DECK_NAME[d]}词库`} · {deckCount(state, d)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </header>
          )}
          {!realToday && <div className="banner warn page-banner">模拟日期：{today}（URL 中的 ?today= 参数）</div>}
          {saveError && (
            <div className="banner error page-banner" role="alert">
              {saveError}
            </div>
          )}
          <main className={focus ? "main focus-main" : "main"}>
            {practice.open ? (
              <PracticePage state={state} update={update} today={today} />
            ) : route.tab === "today" ? (
              <TodayPage state={state} update={update} today={today} />
            ) : route.tab === "training" ? (
              <TrainingPage state={state} update={update} today={today} />
            ) : route.tab === "library" ? (
              <LibraryPage state={state} update={update} today={today} />
            ) : (
              <StatsPage state={state} update={update} today={today} />
            )}
          </main>
          {!focus && (
            <nav className="bottom-nav" aria-label="底部导航">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="nav-item"
                  aria-current={route.tab === t.id ? "page" : undefined}
                  onClick={() => go({ tab: t.id })}
                >
                  <Icon name={t.icon} />
                  {TAB_LABEL[t.id]}
                </button>
              ))}
            </nav>
          )}
        </div>
      </FocusProvider>
    </NavCtx.Provider>
  );
}
