import { useEffect, useState } from "react";
import type { AppState } from "../types";
import { imageRefCount, missingImageRefs } from "../lib/part1";
import { listImageKeys } from "../lib/imageStore";

/** 本机图片库状态：词条引用的图片是否都在本机 */
export default function ImageStatus({ state, showOk }: { state: AppState; showOk?: boolean }) {
  const refs = imageRefCount(state);
  const [info, setInfo] = useState<{ stored: number; missing: number } | "error" | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!refs) return;
    listImageKeys()
      .then((k) => alive && setInfo({ stored: k.size, missing: missingImageRefs(state, k) }))
      .catch(() => alive && setInfo("error"));
    return () => {
      alive = false;
    };
  }, [state, refs, tries]);
  if (!refs || info === null) return null;
  if (info === "error")
    return (
      <div className="banner error" data-testid="image-status">
        读取本机图片库失败。{" "}
        <button className="btn small" onClick={() => setTries((n) => n + 1)}>
          重试
        </button>
      </div>
    );
  if (info.missing)
    return (
      <div className="banner warn" data-testid="image-status">
        有 {info.missing} / {refs} 个词条的图片不在这台设备的浏览器里（可能是换了网址、换了浏览器，或从主屏幕图标和 Safari 分别打开，它们的存储不互通）。到「词库」切到「托业」→「导入 Part 1 图片词库」，重新选择同一个 ZIP 就能补齐，复习进度不受影响。
      </div>
    );
  return showOk ? (
    <div className="hint" data-testid="image-status">
      本机图片库：{info.stored} 张，词条引用的 {refs} 张都在。
    </div>
  ) : null;
}
