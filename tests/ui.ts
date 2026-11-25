import { fireEvent, screen, within } from "@testing-library/react";

/** 点底部导航（今日 / 专项 / 词库 / 记录） */
export function goTab(name: "今日" | "专项" | "词库" | "记录") {
  fireEvent.click(within(screen.getByRole("navigation", { name: "底部导航" })).getByRole("button", { name }));
}

/** 顶部的词库范围下拉 */
export function setDeck(deck: "all" | "toefl" | "toeic") {
  fireEvent.change(screen.getByLabelText("词库范围"), { target: { value: deck } });
}

/** 词库页打开导入面板 */
export function openImport(kind: "Word 生词本" | "托福阅读词汇册" | "Part 1 图片包" | "AI 语音包" = "Word 生词本") {
  if (!document.getElementById("import-panel")) fireEvent.click(screen.getByRole("button", { name: "导入" }));
  fireEvent.click(screen.getByRole("tab", { name: kind }));
}
