import { useState } from "react";
import { useStore } from "./store";
import ReviewPage from "./pages/ReviewPage";
import LibraryPage from "./pages/LibraryPage";
import StatsPage from "./pages/StatsPage";
import ReadingPage from "./pages/ReadingPage";
import { getToday, toDay } from "./lib/util";
import { DECK_NAME, deckCount } from "./lib/decks";
import type { DeckFilter } from "./types";
import { useAvoidHostBadge } from "./lib/hostBadge";

type Tab = "review" | "reading" | "library" | "stats";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "review", label: "今日复习", icon: "📅" },
  { id: "reading", label: "托福阅读", icon: "📖" },
  { id: "library", label: "词库", icon: "📚" },
  { id: "stats", label: "学习记录", icon: "📈" },
];

export default function App() {
  const { state, update, saveError } = useStore();
  useAvoidHostBadge();
  const [tab, setTab] = useState<Tab>("review");
  const today = getToday();
  const realToday = today === toDay();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">生词复习 <small>托业 · 托福</small></div>
        <nav className="tabs" aria-label="主导航">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
              <span className="tab-icon" aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {tab !== "reading" && state.order.length > 0 && (
        <div className="deck-bar" role="group" aria-label="词库">
          <span className="hint">词库</span>
          {(["all", "toefl", "toeic"] as DeckFilter[]).map((d) => (
            <button
              key={d}
              className={state.settings.deck === d ? "seg-btn active" : "seg-btn"}
              aria-pressed={state.settings.deck === d}
              onClick={() => update((st) => ({ ...st, settings: { ...st.settings, deck: d } }))}
            >
              {DECK_NAME[d]} {deckCount(state, d)}
            </button>
          ))}
        </div>
      )}
      {!realToday && <div className="banner warn">模拟日期：{today}（URL 中的 ?today= 参数）</div>}
      {saveError && <div className="banner error">{saveError}</div>}
      <main className="main">
        {tab === "review" && <ReviewPage state={state} update={update} today={today} goLibrary={() => setTab("library")} />}
        {tab === "reading" && <ReadingPage state={state} update={update} today={today} />}
        {tab === "library" && <LibraryPage state={state} update={update} today={today} />}
        {tab === "stats" && <StatsPage state={state} update={update} today={today} />}
      </main>
    </div>
  );
}
