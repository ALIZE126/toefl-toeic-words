import { useEffect, useRef, useState } from "react";
import type { Part1Image } from "../types";
import { acquireImageUrl, invalidateImage, onImagesReset } from "../lib/imageStore";
import Icon from "./Icon";

interface Props {
  image?: Part1Image;
  /** 听音选图提交前只写「图片 A」，不能透露短语 */
  alt: string;
  className?: string;
  /** 小图：缺图时只显示简短提示 */
  compact?: boolean;
  /** 允许点击放大 */
  zoomable?: boolean;
}

/** 让应用跳到「词库 → 导入 → Part 1 图片包」（重新关联图片） */
export function requestRelink() {
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { to: "import-part1" } }));
}

type Status = { kind: "loading" } | { kind: "ok"; url: string } | { kind: "missing" } | { kind: "error"; reason: string };

/**
 * 从本机 IndexedDB 读取图片包里的图片（按 sha256 资产 ID）。
 * - 使用期间持有 object URL，卸载后释放；
 * - 页面从后台恢复、或 blob URL 失效（图片 onError）时重新读取一次；
 * - 缺图 / 读取失败分别给出原因、重试和重新关联入口。
 */
export default function PackImage({ image, alt, className = "", compact, zoomable }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [tries, setTries] = useState(0);
  const [zoom, setZoom] = useState(false);
  const retried = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sha = image?.sha256;

  useEffect(() => onImagesReset(() => setTries((n) => n + 1)), []);

  useEffect(() => {
    let alive = true;
    let release = () => {};
    if (!sha) {
      setStatus({ kind: "missing" });
      return;
    }
    setStatus((s) => (s.kind === "ok" ? s : { kind: "loading" }));
    acquireImageUrl(sha)
      .then((r) => {
        release = r.release;
        if (!alive) return r.release();
        setStatus(r.url ? { kind: "ok", url: r.url } : { kind: "missing" });
      })
      .catch((e) => alive && setStatus({ kind: "error", reason: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
      release();
    };
  }, [sha, tries]);

  const ratio = image?.width && image?.height ? `${image.width} / ${image.height}` : "4 / 3";

  if (status.kind === "loading") return <div className={`pimg pimg-wait ${className}`} style={{ aspectRatio: ratio }} aria-label="图片加载中" role="img" />;
  if (status.kind !== "ok") {
    const missing = status.kind === "missing";
    return (
      <div className={`pimg pimg-wait missing ${className}`} style={{ aspectRatio: ratio }} role="img" aria-label={alt}>
        {compact ? (
          <span>{missing ? "无图片" : "读取失败"}</span>
        ) : (
          <>
            <span>
              {!image
                ? "这个词条没有配图"
                : missing
                  ? "这台设备的浏览器里没有这张图片（可能换了网址或浏览器）。"
                  : `图片读取失败：${status.reason}`}
            </span>
            {image && (
              <span className="row center-row">
                {!missing && (
                  <button type="button" className="btn-secondary small" onClick={(e) => (e.stopPropagation(), setTries((n) => n + 1))}>
                    <Icon name="rotate-ccw" size={16} />
                    重试
                  </button>
                )}
                <button type="button" className="btn-secondary small" onClick={(e) => (e.stopPropagation(), requestRelink())}>
                  重新关联图片包
                </button>
              </span>
            )}
          </>
        )}
      </div>
    );
  }

  const img = (
    <img
      className={`pimg ${className}`}
      src={status.url}
      alt={alt}
      data-asset={sha}
      width={image?.width}
      height={image?.height}
      style={{ aspectRatio: ratio }}
      onError={() => {
        // blob URL 失效（例如 iOS 后台恢复后）：丢掉缓存重新读一次；仍失败才显示错误
        if (!retried.current && sha) {
          retried.current = true;
          invalidateImage(sha);
          setTries((n) => n + 1);
        } else setStatus({ kind: "error", reason: "图片数据无法显示" });
      }}
    />
  );
  if (!zoomable) return img;
  return (
    <>
      <button ref={trigger} type="button" className="pimg-zoom" onClick={() => setZoom(true)} aria-label={`放大查看：${alt}`}>
        {img}
        <span className="pimg-zoom-hint" aria-hidden="true">
          <Icon name="maximize" size={16} />
        </span>
      </button>
      {zoom && (
        <Lightbox
          url={status.url}
          alt={alt}
          onClose={() => {
            setZoom(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      )}
    </>
  );
}

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="放大的图片" onClick={onClose}>
      <img src={url} alt={alt} onClick={(e) => e.stopPropagation()} />
      <button ref={close} type="button" className="lightbox-close" onClick={onClose} aria-label="关闭大图">
        <Icon name="x" size={22} />
        关闭
      </button>
    </div>
  );
}
