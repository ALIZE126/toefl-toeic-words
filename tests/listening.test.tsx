import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { importedState } from "./helpers";
import ListeningCard from "../src/components/ListeningCard";
import App from "../src/App";
import { listenChoices } from "../src/lib/questions";
import { introduce, recordAnswer } from "../src/lib/scheduler";
import { saveState } from "../src/lib/storage";
import type { AppState } from "../src/types";

afterEach(() => cleanup());

async function propertyCase() {
  const state = await importedState();
  const entry = state.entries["property"];
  const sense = entry.senses.find((s) => s.id === "property#asset")!;
  const example = sense.examples.find((x) => x.role === "test")!;
  const q = listenChoices(state, entry, sense, example, "seed");
  return { state, entry, sense, example, q };
}

/** 提交前不该出现在页面（包括 DOM）里的内容 */
function assertHidden(html: string, text: string, sense: { gloss: string }, zh?: string) {
  expect(html).not.toContain(text);
  expect(html.toLowerCase()).not.toContain("propert");
  expect(html).not.toContain(sense.gloss);
  if (zh) expect(html).not.toContain(zh);
}

describe("无字幕听力：提交前隐藏字幕", () => {
  it("提交前 DOM 中没有句子、目标词、释义和翻译；提交后显示", async () => {
    const { state, entry, sense, example, q } = await propertyCase();
    const speakFn = vi.fn(async () => ({ ok: true as const }));
    const onDone = vi.fn();
    const { container } = render(
      <ListeningCard entry={entry} sense={sense} example={example} prompt={q.prompt} choices={q.choices} settings={state.settings} commute={false} onDone={onDone} speakFn={speakFn} />,
    );
    assertHidden(container.innerHTML, example.text, sense, example.zh);
    expect(screen.getByText("公司做了什么来还债？")).toBeTruthy();

    // 听两遍
    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    expect(speakFn).toHaveBeenCalledWith(example.text, expect.anything());
    assertHidden(container.innerHTML, example.text, sense, example.zh);

    fireEvent.click(screen.getByText("卖掉了市中心的一处房产"));
    assertHidden(container.innerHTML, example.text, sense, example.zh);
    fireEvent.click(screen.getByText("提交"));

    expect(screen.getByTestId("listening-reveal").textContent).toContain("重听才懂");
    expect(container.textContent).toContain("The firm sold one of its");
    expect(container.textContent).toContain("property");
    expect(container.textContent).toContain(sense.gloss);
    fireEvent.click(screen.getByText("下一题 →"));
    expect(onDone).toHaveBeenCalledWith({ result: "replay", plays: 2, audioFallback: false });
  });

  it("首听选对记为「首听听懂」，点「没听懂，看字幕」记为「看字幕才懂」", async () => {
    const { state, entry, sense, example, q } = await propertyCase();
    const speakFn = vi.fn(async () => ({ ok: true as const }));
    const onDone = vi.fn();
    const props = { entry, sense, example, prompt: q.prompt, choices: q.choices, settings: state.settings, commute: false, onDone, speakFn };
    const r1 = render(<ListeningCard {...props} />);
    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    fireEvent.click(screen.getByText("卖掉了市中心的一处房产"));
    fireEvent.click(screen.getByText("提交"));
    fireEvent.click(screen.getByText("下一题 →"));
    expect(onDone).toHaveBeenLastCalledWith({ result: "first", plays: 1, audioFallback: false });
    r1.unmount();

    render(<ListeningCard {...props} />);
    fireEvent.click(screen.getByText("没听懂，看字幕"));
    expect(screen.getByTestId("listening-reveal").textContent).toContain("看字幕才懂");
    fireEvent.click(screen.getByText("下一题 →"));
    expect(onDone).toHaveBeenLastCalledWith({ result: "subtitle", plays: 0, audioFallback: false });
  });

  it("语音不可用时显示明确提示，可以改做文字题", async () => {
    const { state, entry, sense, example, q } = await propertyCase();
    const speakFn = vi.fn(async () => ({ ok: false as const, reason: "当前浏览器不支持语音合成（Web Speech API）。" }));
    const onDone = vi.fn();
    const { container } = render(
      <ListeningCard entry={entry} sense={sense} example={example} prompt={q.prompt} choices={q.choices} settings={state.settings} commute={false} onDone={onDone} speakFn={speakFn} />,
    );
    await act(async () => fireEvent.click(screen.getByLabelText("播放句子")));
    expect(screen.getByRole("alert").textContent).toContain("无法播放语音");
    assertHidden(container.innerHTML, example.text, sense, example.zh);
    fireEvent.click(screen.getByText("改做文字题"));
    expect(container.textContent).toContain("The firm sold one of its");
    fireEvent.click(screen.getByText("卖掉了市中心的一处房产"));
    fireEvent.click(screen.getByText("提交"));
    fireEvent.click(screen.getByText("下一题 →"));
    expect(onDone).toHaveBeenCalledWith({ result: "correct", plays: 0, audioFallback: true });
  });
});

describe("整个应用：今日复习与词库状态", () => {
  beforeEach(() => localStorage.clear());

  it("复习队列的第一张听力题，整页提交前都看不到目标词和字幕", async () => {
    let state: AppState = await importedState();
    // 用 URL 模拟“初学的第二天”
    const today = new Date();
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const y = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
    state = introduce(state, "postpone", "postpone#delay", y);
    state = { ...state, settings: { ...state.settings, newPerDay: 0 } };
    saveState(state);

    render(<App />);
    fireEvent.click(screen.getByText(/开始今日复习/));
    expect(screen.getByTestId("listening-card")).toBeTruthy();
    const html = document.body.innerHTML;
    expect(html.toLowerCase()).not.toContain("postpone");
    expect(html).not.toContain("client meeting");
    expect(html).not.toContain("推迟；延期");
    expect(screen.getByText("客户会议要怎么处理？")).toBeTruthy();

    fireEvent.click(screen.getByText("没听懂，看字幕"));
    expect(document.body.textContent).toContain("We'll have to postpone the client meeting.");
  });

  it("词库里同一词条显示「文字已掌握」和「听力待复习」", async () => {
    let state: AppState = await importedState();
    const t = new Date();
    const d = (n: number) => {
      const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    const card = (type: "text" | "listening") => ({ id: type, type, entryId: "seminar", senseId: "seminar#meeting", exampleId: "seminar#meeting/test1" });
    state = introduce(state, "seminar", "seminar#meeting", d(-7));
    state = recordAnswer(state, { card: card("text"), result: "good", day: d(-6) });
    state = recordAnswer(state, { card: card("text"), result: "good", day: d(-4) });
    state = recordAnswer(state, { card: card("text"), result: "good", day: d(0) });
    state = recordAnswer(state, { card: card("listening"), result: "subtitle", day: d(-1) });
    saveState(state);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "词库" }));
    fireEvent.click(screen.getByText("学习中"));
    const row = screen.getByText("seminar").closest("button")!;
    expect(row.textContent).toContain("文字已掌握");
    expect(row.textContent).toContain("听力待复习");

    fireEvent.click(row);
    expect(document.body.textContent).toContain("文字回忆：已掌握");
    expect(document.body.textContent).toContain("无字幕听力：待复习");
  });
});
