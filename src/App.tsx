import { useState } from "react";
import { useStore } from "./store";
import ReviewPage from "./pages/ReviewPage";
import LibraryPage from "./pages/LibraryPage";
import StatsPage from "./pages/StatsPage";
import { getToday, toDay } from "./lib/util";

type Tab = "review" | "library" | "stats";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "review", label: "今日复习", icon: "📅" },
  { id: "library", label: "词库", icon: "📚" },
  { id: "stats", label: "学习记录", icon: "📈" },
];

export default function App() {
  const { state, update, saveError } = useStore();
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
      {!realToday && <div className="banner warn">模拟日期：{today}（URL 中的 ?today= 参数）</div>}
      {saveError && <div className="banner error">{saveError}</div>}
      <main className="main">
        {tab === "review" && <ReviewPage state={state} update={update} today={today} goLibrary={() => setTab("library")} />}
        {tab === "library" && <LibraryPage state={state} update={update} today={today} />}
        {tab === "stats" && <StatsPage state={state} update={update} today={today} />}
      </main>
    </div>
  );
}
