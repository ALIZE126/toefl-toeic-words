import { afterEach, describe, expect, it, vi } from "vitest";
import { currentVoice, englishVoices, loadVoices, voiceQuality } from "../src/lib/speech";

const v = (name: string, voiceURI: string, lang = "en-US") => ({ name, voiceURI, lang, localService: true, default: false }) as SpeechSynthesisVoice;
// iOS Safari 实际返回的 voiceURI 形式
const IOS = [
  v("Samantha", "com.apple.voice.compact.en-US.Samantha"),
  v("Daniel", "com.apple.voice.compact.en-GB.Daniel", "en-GB"),
  v("Ava", "com.apple.voice.premium.en-US.Ava"),
  v("Evan", "com.apple.voice.enhanced.en-US.Evan"),
  v("Tingting", "com.apple.voice.compact.zh-CN.Tingting", "zh-CN"),
];

afterEach(() => vi.unstubAllGlobals());

describe("英文语音：识别并优先使用高级版", () => {
  it("按 voiceURI 识别质量，英文列表高级版在前", () => {
    expect(IOS.map(voiceQuality)).toEqual(["standard", "standard", "premium", "enhanced", "standard"]);
    expect(voiceQuality(v("Ava (Premium)", "x"))).toBe("premium");
    expect(voiceQuality(v("Evan（增强版）", "x"))).toBe("enhanced");
    expect(englishVoices(IOS).map((x) => x.name)).toEqual(["Ava", "Evan", "Samantha", "Daniel"]);
  });

  it("没手动选时自动用高级版的美式语音；手动选的优先", async () => {
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => IOS, addEventListener() {}, removeEventListener() {} } });
    await loadVoices();
    expect(currentVoice()?.name).toBe("Ava");
    expect(currentVoice("com.apple.voice.compact.en-GB.Daniel")?.name).toBe("Daniel");
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => IOS.filter((x) => !/premium|enhanced/.test(x.voiceURI)), addEventListener() {}, removeEventListener() {} } });
    await loadVoices();
    expect(currentVoice()?.name).toBe("Samantha");
  });
});
