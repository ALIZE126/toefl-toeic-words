import type { Ref } from "react";

interface Props {
  prefix: string;
  /** 缺几个字母（决定输入框宽度和下划线占位） */
  length: number;
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  status?: "right" | "wrong";
  /** 回车跳到下一空 */
  onEnter?: () => void;
  onFocus?: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** 只保留字母，最多 length 个（粘贴、输入法上屏的内容也一样截断） */
export function clampBlank(raw: string, length: number): string {
  return raw.replace(/[^A-Za-z]/g, "").slice(0, length);
}

/**
 * 段落原位的「前半个词 + 输入框」。缺几个字母就有几个格子，最多只能输入这么多个字母；
 * 删除只作用于这个空里自己输入的字母，前半个词不能删，空里没字时按删除键不会动到别的空。关闭自动纠正、自动大写、拼写检查和自动填充，
 * 保证手机键盘不会把输入改成别的词。Tab 键按 DOM 顺序在各空之间切换。
 */
export default function BlankInput({ prefix, length, value, onChange, label, disabled, status, onEnter, onFocus, inputRef }: Props) {
  return (
    <span className={`blank${status ? ` ${status}` : ""}`}>
      <span className="blank-prefix">{prefix}</span>
      <input
        ref={inputRef}
        type="text"
        className="blank-input"
        style={{ width: `calc(${length}ch + 6px)` }}
        value={clampBlank(value, length)}
        maxLength={length}
        aria-label={label}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="next"
        data-form-type="other"
        onChange={(e) => onChange(clampBlank(e.target.value, length))}
        onFocus={(e) => {
          onFocus?.();
          // 手机键盘弹出后，把当前空滚到可见区域（键盘上方的操作区之上）
          const el = e.currentTarget;
          setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          } else if ((e.key === "Backspace" || e.key === "Delete") && !e.currentTarget.value) {
            // 空里已经没有字母：删除键什么都不做
            e.preventDefault();
          }
        }}
      />
    </span>
  );
}
