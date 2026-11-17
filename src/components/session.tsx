import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ───────────── 作答阶段的保存与恢复 ─────────────
 * 练习卡片的阶段（是否已显示答案、选了哪项、听了几遍……）通过 useCardState 保存到会话里，
 * 刷新页面或退出后再「继续学习」，回到同一题的同一阶段。
 */

interface CardStateCtx {
  cardId: string;
  data: Record<string, unknown>;
  save: (key: string, value: unknown) => void;
}

const Ctx = createContext<CardStateCtx | null>(null);

export function CardStateProvider({ value, children }: { value: CardStateCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

type SetState<T> = (v: T | ((prev: T) => T)) => void;

/**
 * 和 useState 一样，但在练习会话里会保存到会话，恢复时读回来。
 * persist：初始值本身也要保存（例如随机排好的图片顺序），否则恢复时会重新随机。
 */
export function useCardState<T>(key: string, init: T | (() => T), opts: { persist?: boolean } = {}): [T, SetState<T>] {
  const ctx = useContext(Ctx);
  const [value, setValue] = useState<T>(() =>
    ctx && key in ctx.data ? (ctx.data[key] as T) : typeof init === "function" ? (init as () => T)() : init,
  );
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    if (opts.persist && ctx && !(key in ctx.data)) ctx.save(key, ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set: SetState<T> = (v) => {
    const next = typeof v === "function" ? (v as (p: T) => T)(ref.current) : v;
    ref.current = next;
    setValue(next);
    ctx?.save(key, next);
  };
  return [value, set];
}

/* ───────────── 底部固定操作区 ─────────────
 * 练习页把当前操作（显示答案、自评、提交、下一题）放到屏幕底部固定的位置，
 * 阶段切换时主按钮位置不变。没有操作区的地方（如单独渲染卡片）就地显示。
 */

const SlotCtx = createContext<HTMLElement | null>(null);

export function ActionSlotProvider({ el, children }: { el: HTMLElement | null; children: ReactNode }) {
  return <SlotCtx.Provider value={el}>{children}</SlotCtx.Provider>;
}

export function ActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const slot = useContext(SlotCtx);
  const body = <div className={`action-bar-inner ${className}`}>{children}</div>;
  return slot ? createPortal(body, slot) : <div className="actions">{children}</div>;
}
