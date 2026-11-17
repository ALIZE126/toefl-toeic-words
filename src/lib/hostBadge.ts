import { useEffect } from "react";

/** 托管平台插入的悬浮徽标（Netlify 免费套餐会在右下角加「Powered by Netlify」） */
const BADGE_SELECTOR = '#nl-badge-frame, iframe[title="Powered by Netlify"]';

/** 徽标从屏幕底部往上占了多高（px）；没有徽标或徽标不在底部时为 0 */
export function badgeOffset(doc: Document = document, viewportHeight = window.innerHeight): number {
  const el = doc.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || r.bottom < viewportHeight - 4) return 0;
  return Math.max(0, Math.ceil(viewportHeight - r.top));
}

/**
 * 有徽标时，把底部导航整体往上挪，避免被挡住（CSS 变量 --host-badge-h）。
 * 没有徽标的网址（如 GitHub Pages）不受影响。
 */
export function useAvoidHostBadge() {
  useEffect(() => {
    const root = document.documentElement;
    let last = -1;
    const apply = () => {
      const h = badgeOffset();
      if (h !== last) {
        last = h;
        root.style.setProperty("--host-badge-h", `${h}px`);
      }
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", apply);
    // 徽标可能先插入、再改尺寸，开头几秒多量几次
    const timers = [300, 1000, 2500].map((ms) => setTimeout(apply, ms));
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", apply);
      timers.forEach(clearTimeout);
    };
  }, []);
}
