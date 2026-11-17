import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { badgeOffset } from "../src/lib/hostBadge";
import App from "../src/App";

afterEach(() => {
  cleanup();
  document.querySelectorAll("#nl-badge-frame").forEach((e) => e.remove());
  document.documentElement.style.removeProperty("--host-badge-h");
});

/** 模拟 Netlify 徽标：202×64，贴在 412×839 屏幕的右下角 */
function addBadge(top = 775, height = 64) {
  const f = document.createElement("iframe");
  f.id = "nl-badge-frame";
  f.title = "Powered by Netlify";
  f.getBoundingClientRect = () => ({ x: 210, y: top, top, left: 210, width: 202, height, right: 412, bottom: top + height, toJSON() {} }) as DOMRect;
  document.body.appendChild(f);
  return f;
}

describe("避开托管平台的悬浮徽标", () => {
  it("没有徽标时不挪；徽标贴在底部时按它占的高度挪；徽标不在底部时不挪", () => {
    expect(badgeOffset(document, 839)).toBe(0);
    const f = addBadge();
    expect(badgeOffset(document, 839)).toBe(64);
    f.remove();
    addBadge(100);
    expect(badgeOffset(document, 839)).toBe(0);
  });

  it("应用运行中徽标出现后，底部导航自动上移", async () => {
    Object.defineProperty(window, "innerHeight", { value: 839, configurable: true });
    render(<App />);
    expect(document.documentElement.style.getPropertyValue("--host-badge-h")).toBe("0px");
    await act(async () => {
      addBadge();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.documentElement.style.getPropertyValue("--host-badge-h")).toBe("64px");
  });
});
