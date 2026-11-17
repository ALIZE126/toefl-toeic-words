import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import { ActionSlotProvider } from "./session";

/* ───────────── 四入口导航 ─────────────
 * 今日 / 专项 / 词库 / 记录。旧页面的对应关系：
 *   今日复习 → 今日；托福阅读 → 专项 · 托福补词；Part 1 专项 → 专项 · 托业 Part1；学习记录 → 记录。
 */

export type Tab = "today" | "training" | "library" | "records";
export type Sub = "toefl" | "part1" | "part1-list" | "part1-study" | "import" | "import-part1" | undefined;
export interface Route {
  tab: Tab;
  sub?: Sub;
  /** 托福补词：打开的短文 */
  passage?: string;
}

export const TAB_LABEL: Record<Tab, string> = { today: "今日", training: "专项", library: "词库", records: "记录" };

export interface Nav {
  route: Route;
  go: (r: Route) => void;
  /** 进入练习会话（专注页），返回时回到当前页面 */
  openPractice: () => void;
  closePractice: () => void;
  practiceOpen: boolean;
}

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavCtx);
  if (nav) return nav;
  // 单独渲染组件（测试）时的空实现
  return { route: { tab: "today" }, go: () => {}, openPractice: () => {}, closePractice: () => {}, practiceOpen: false };
}

/* ───────────── 专注页（练习） ─────────────
 * 顶部：返回、类型、进度；中部：题目（可滚动）；底部：固定的当前操作。
 * 为固定操作区和安全区域留出空间，并在手机软键盘弹出时把操作区放到键盘上方。
 */

const FocusCtx = createContext<(on: boolean) => void>(() => {});
export const FocusProvider = FocusCtx.Provider;

/** 软键盘占用的高度 → CSS 变量 --kb-inset（iOS Safari 的 fixed 元素不会自动避开键盘） */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--kb-inset", `${inset > 80 ? inset : 0}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.setProperty("--kb-inset", "0px");
    };
  }, []);
}

interface FocusProps {
  title: ReactNode;
  progress?: { done: number; total: number; label?: string };
  onBack: () => void;
  backLabel?: string;
  children: ReactNode;
  /** 底部操作区里没有卡片放按钮时，页面自己放的按钮 */
  actions?: ReactNode;
}

export function FocusLayout({ title, progress, onBack, backLabel = "返回", children, actions }: FocusProps) {
  const setFocus = useContext(FocusCtx);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    setFocus(true);
    return () => setFocus(false);
  }, [setFocus]);
  useKeyboardInset();
  // 内容区底部留出操作区的实际高度
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--action-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, []);
  const pct = progress && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  return (
    <div className="focus">
      <header className="focus-head">
        <button type="button" className="back" onClick={onBack}>
          <Icon name="chevron-left" />
          {backLabel}
        </button>
        <span className="focus-title">{title}</span>
        <span className="focus-count">{progress ? progress.label ?? `${Math.min(progress.done + 1, progress.total)} / ${progress.total}` : ""}</span>
      </header>
      {progress && (
        <div className="progress" role="progressbar" aria-label="练习进度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ActionSlotProvider el={slot}>
        <div className="focus-body">{children}</div>
      </ActionSlotProvider>
      <div
        className="action-bar"
        ref={(el) => {
          bar.current = el;
        }}
      >
        <div className="action-bar-slot" ref={setSlot} />
        {actions && <div className="action-bar-inner">{actions}</div>}
      </div>
    </div>
  );
}
