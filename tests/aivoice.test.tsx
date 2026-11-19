import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 60000 });
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { AUDIO_PACK_PATH, importedState } from "./helpers";
import { audioCount, audioKey, hasAudio, loadAudioIndex, putAudio, resetAudioStoreForTests } from "../src/lib/audioStore";
import { readAudioPack, storeAudioPack } from "../src/components/AudioPackImport";
import { resetHandoffForTests, speak, speechOptions } from "../src/lib/speech";
import { saveState } from "../src/lib/storage";
import App from "../src/App";
import { goTab, openImport } from "./ui";

let played: { src: string; rate: number }[];
let spoken: string[];

beforeEach(async () => {
  resetAudioStoreForTests();
  resetHandoffForTests();
  localStorage.clear();
  await new Promise<void>((r) => {
    const q = indexedDB.deleteDatabase("toefl-toeic-words-audio");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
  played = [];
  spoken = [];
  class FakeAudio {
    src = "";
    playbackRate = 1;
    onplaying?: () => void;
    onerror?: () => void;
    setAttribute() {}
    pause() {}
    play() {
      if (this.src.startsWith("blob:audio/mpeg")) played.push({ src: this.src, rate: this.playbackRate });
      setTimeout(() => this.onplaying?.(), 0);
      return Promise.resolve();
    }
  }
  vi.stubGlobal("Audio", FakeAudio);
  // 用 Blob 的类型当 URL，区分 AI 音频和解锁用的静音
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as Blob).type}/${++n}`);
  class U {
    onstart?: () => void;
    voice?: unknown;
    lang = "";
    rate = 1;
    constructor(public text: string) {}
  }
  vi.stubGlobal("SpeechSynthesisUtterance", U);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => [{ lang: "en-US", name: "S", voiceURI: "s" }],
      speak: (u: U) => {
        spoken.push(u.text);
        setTimeout(() => u.onstart?.(), 0);
      },
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI 语音", () => {
  it("有音频的句子播放音频，没有的用系统语音；慢速减速播放；关闭设置后一律用系统语音", async () => {
    await putAudio([{ key: audioKey("The woman is holding a cup."), text: "The woman is holding a cup.", type: "audio/mpeg", data: new Uint8Array([1, 2, 3]).buffer }]);
    expect(hasAudio("the woman is  holding a cup.")).toBe(true);
    const opts = speechOptions({ rate: 0.95 });
    expect(await speak("The woman is holding a cup.", opts)).toEqual({ ok: true });
    expect(played).toHaveLength(1);
    expect(played[0].rate).toBe(0.95);
    expect(spoken).toEqual([]);
    await speak("The woman is holding a cup.", speechOptions({ rate: 0.95 }, true));
    expect(played[1].rate).toBe(0.75);
    await speak("A sentence without audio.", opts);
    expect(spoken).toEqual(["A sentence without audio."]);
    await speak("The woman is holding a cup.", speechOptions({ rate: 0.95, aiVoice: false }));
    expect(played).toHaveLength(2);
    expect(spoken).toHaveLength(2);
  });

  it.runIf(existsSync(AUDIO_PACK_PATH))("导入真实的 Part 1 音频包：625 条，重复导入不重复保存", async () => {
    const data = new Uint8Array(readFileSync(AUDIO_PACK_PATH));
    const pack = await readAudioPack(data, "pack.zip");
    expect(pack.manifest.items).toHaveLength(625);
    expect(pack.missing).toBe(0);
    expect(new Set(pack.manifest.items.map((i) => i.voice))).toEqual(new Set(["Laura", "Eric", "Alice", "George", "Charlie"]));
    expect(await storeAudioPack(pack)).toEqual({ stored: 625, skipped: 0 });
    for (const t of ["The woman is reaching for a cup.", "The woman is holding a cup.", "reach for", "The man's adjusting his glasses."]) expect(hasAudio(t), t).toBe(true);
    resetAudioStoreForTests(); // 相当于刷新页面
    await loadAudioIndex();
    expect(audioCount()).toBe(625);
    const again = await readAudioPack(data, "pack.zip");
    expect(again.already).toBe(625);
    expect(await storeAudioPack(again)).toEqual({ stored: 0, skipped: 625 });
  });

  it("词库 → 导入 → AI 语音包；不是音频包时给出提示；今日设置显示条数", async () => {
    saveState(await importedState());
    render(<App />);
    goTab("词库");
    openImport("AI 语音包");
    expect(screen.getByTestId("audio-import").textContent).toContain("本机已有 AI 语音 0 条");
    const bad = new File([new Uint8Array(readFileSync(require("node:path").resolve(__dirname, "../fixtures/生词本.docx"))).slice().buffer], "x.zip");
    fireEvent.change(screen.getByTestId("audio-zip-input"), { target: { files: [bad] } });
    expect((await screen.findByRole("alert")).textContent).toContain("不是音频包");
    await putAudio([{ key: "x", text: "x", type: "audio/mpeg", data: new ArrayBuffer(1) }]);
    goTab("今日");
    fireEvent.click(screen.getByText("学习设置"));
    expect(document.body.textContent).toContain("本机已有 1 条 AI 合成语音");
  });
});
