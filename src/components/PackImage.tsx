import { useEffect, useState } from "react";
import type { Part1Image } from "../types";
import { getImageUrl } from "../lib/imageStore";

interface Props {
  image?: Part1Image;
  /** 听音选图提交前只写「图片 A」，不能透露短语 */
  alt: string;
  className?: string;
  /** 小图：缺图时只显示简短提示 */
  compact?: boolean;
}

/** 从本机 IndexedDB 读取图片包里的图片 */
export default function PackImage({ image, alt, className = "", compact }: Props) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!image) {
      setUrl(null);
      return;
    }
    setUrl(undefined);
    getImageUrl(image.sha256)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [image?.sha256]);

  const ratio = image?.width && image?.height ? `${image.width} / ${image.height}` : "4 / 3";
  if (url === undefined) return <div className={`pimg pimg-wait ${className}`} style={{ aspectRatio: ratio }} aria-label="图片加载中" />;
  if (url === null)
    return (
      <div className={`pimg pimg-wait missing ${className}`} style={{ aspectRatio: ratio }} role="img" aria-label={alt}>
        {compact ? "无图片" : image ? "本机没有这张图片。到「词库 → 托业 → 导入 Part 1 图片词库」重新选择图片包即可补齐。" : "这个词条没有配图"}
      </div>
    );
  return <img className={`pimg ${className}`} src={url} alt={alt} width={image?.width} height={image?.height} style={{ aspectRatio: ratio }} />;
}
