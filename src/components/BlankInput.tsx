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

/**
 * 段落原位的「前半个词 + 输入框」。关闭自动纠正、自动大写、拼写检查和自动填充，
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
        style={{ width: `${Math.max(length, 2) + 1.2}ch` }}
        value={value}
        placeholder={"_".repeat(length)}
        aria-label={label}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="next"
        data-form-type="other"
        onChange={(e) => onChange(e.target.value.replace(/\s+/g, ""))}
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
          }
        }}
      />
    </span>
  );
}
