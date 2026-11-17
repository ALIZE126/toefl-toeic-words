import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_WAIT_MS, isAppleMobile, resetHandoffForTests, speak, speechOptions } from "../src/lib/speech";

let plays: number;
let spoken: { text: string; at: number }[];

beforeEach(() => {
  vi.useFakeTimers();
  resetHandoffForTests();
  plays = 0;
  spoken = [];
  class FakeAudio {
    loop = false;
    currentTime = 0;
    constructor(public src: string) {}
    setAttribute() {}
    play() {
      plays++;
      return Promise.resolve();
    }
    pause() {}
  }
  vi.stubGlobal("Audio", FakeAudio);
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
      getVoices: () => [{ lang: "en-US", name: "Samantha", voiceURI: "sam" }],
      speak: (u: U) => {
        spoken.push({ text: u.text, at: Date.now() });
        setTimeout(() => u.onstart?.(), 0);
      },
      cancel() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("播放时把耳机切到这台设备", () => {
  it("点击时同步开始静音媒体播放，等耳机切过来再朗读；一分钟内再播放不再等待", async () => {
    const t0 = Date.now();
    const p = speak("The woman is holding a cup.", { handoff: true });
    // 还在点击事件里（第一个 await 之前）就已经开始播放
    expect(plays).toBe(1);
    expect(spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(HANDOFF_WAIT_MS - 100);
    expect(spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual({ ok: true });
    expect(spoken[0].at - t0).toBeGreaterThanOrEqual(HANDOFF_WAIT_MS);

    const t1 = Date.now();
    const p2 = speak("Second sentence.", { handoff: true });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p2).toEqual({ ok: true });
    expect(plays).toBe(1);
    expect(spoken[1].at - t1).toBeLessThan(HANDOFF_WAIT_MS);
  });

  it("关闭时不播放静音、不等待", async () => {
    const p = speak("No handoff.", { handoff: false });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toEqual({ ok: true });
    expect(plays).toBe(0);
  });

  it("没设置过时，iPhone / iPad 默认开启，电脑默认关闭；设置后以设置为准", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get");
    ua.mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(isAppleMobile()).toBe(true);
    expect(speechOptions({ rate: 1 }).handoff).toBe(true);
    expect(speechOptions({ rate: 1, audioHandoff: false }).handoff).toBe(false);
    ua.mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    expect(speechOptions({ rate: 1 }).handoff).toBe(false);
    expect(speechOptions({ rate: 1, audioHandoff: true }, true)).toEqual({ rate: 0.7, voiceURI: undefined, handoff: true });
    ua.mockRestore();
  });
});
