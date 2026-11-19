/** 浏览器语音合成（Web Speech API）封装，带可用性检测 */

export type SpeakOutcome = { ok: true } | { ok: false; reason: string };

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

let voicesCache: SpeechSynthesisVoice[] = [];

export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) {
    voicesCache = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      voicesCache = window.speechSynthesis.getVoices();
      window.speechSynthesis.removeEventListener?.("voiceschanged", done);
      resolve(voicesCache);
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** 语音质量：Apple 的 voiceURI 里带等级（com.apple.voice.premium / enhanced / compact），其他平台看名字 */
export type VoiceQuality = "premium" | "enhanced" | "standard";
export function voiceQuality(v: Pick<SpeechSynthesisVoice, "voiceURI" | "name">): VoiceQuality {
  const s = `${v.voiceURI} ${v.name}`.toLowerCase();
  if (/premium|高级|neural|natural/.test(s)) return "premium";
  if (/enhanced|增强/.test(s)) return "enhanced";
  return "standard";
}
export const QUALITY_LABEL: Record<VoiceQuality, string> = { premium: "高级版", enhanced: "增强版", standard: "标准" };
const RANK: Record<VoiceQuality, number> = { premium: 0, enhanced: 1, standard: 2 };

/** 英文语音，高级版在前 */
export function englishVoices(voices: SpeechSynthesisVoice[] = voicesCache): SpeechSynthesisVoice[] {
  return voices.filter((v) => /^en[-_]/i.test(v.lang)).sort((a, b) => RANK[voiceQuality(a)] - RANK[voiceQuality(b)]);
}

/** 重新向系统要一次语音列表（下载新语音后用） */
export function refreshVoices(): Promise<SpeechSynthesisVoice[]> {
  voicesCache = [];
  return loadVoices(2500);
}

function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const en = englishVoices();
  const us = en.filter((v) => /en[-_]US/i.test(v.lang));
  return (
    en.find((v) => v.voiceURI === voiceURI) ??
    // 没手动选：优先高级版 / 增强版的美式语音，其次常见的美式语音
    us.find((v) => voiceQuality(v) !== "standard") ??
    en.find((v) => voiceQuality(v) !== "standard") ??
    us.find((v) => /Samantha|Alex|Ava|Allison|Google US/i.test(v.name)) ??
    us[0] ??
    en[0]
  );
}

/** 当前实际会用哪个语音（设置页显示用） */
export function currentVoice(voiceURI?: string) {
  return pickVoice(voiceURI);
}

/**
 * 朗读一句英文。播放成功开始返回 ok；不支持 / 没有英文语音 / 出错 / 超时没有开始播放时返回原因。
 */
export interface SpeakOptions {
  rate?: number;
  voiceURI?: string;
  /** 先把耳机切过来（见 startHandoff） */
  handoff?: boolean;
}

/** iPhone / iPad（iPadOS 的 Safari 会伪装成 Mac，用触点数区分） */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1);
}

export function speechOptions(settings: { rate: number; voiceURI?: string; audioHandoff?: boolean }, slow = false): SpeakOptions {
  return { rate: slow ? 0.7 : settings.rate, voiceURI: settings.voiceURI, handoff: settings.audioHandoff ?? isAppleMobile() };
}

/* ───────────── 耳机自动切换 ─────────────
 * AirPods 的「自动切换」只在设备开始「媒体播放」时触发。浏览器语音合成不算媒体播放，
 * 所以点播放时先用 <audio> 播一段静音，让系统把耳机切过来，再开始朗读。
 */

/** 等耳机切过来的时间 */
export const HANDOFF_WAIT_MS = 1200;
/** 这段时间内播放过就认为耳机已经在这台设备上，不再等待 */
const HANDOFF_WARM_MS = 60_000;
let handoffAudio: HTMLAudioElement | null = null;
let lastHandoff = 0;

function silentWavUrl(seconds = 3): string {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/**
 * 必须在点击事件里同步调用（iOS 只允许用户点击时开始播放）。
 * 返回 true 表示耳机可能还在别的设备上，需要等一下再朗读。
 */
export function startHandoff(): boolean {
  if (typeof window === "undefined" || typeof Audio === "undefined") return false;
  const now = Date.now();
  const cold = now - lastHandoff > HANDOFF_WARM_MS;
  lastHandoff = now;
  if (!cold) return false;
  try {
    // Safari 16.4+：把网页音频当作媒体播放（静音开关打开时也能出声）
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {
    /* 不支持就算了 */
  }
  try {
    handoffAudio ??= Object.assign(new Audio(silentWavUrl()), { loop: true });
    handoffAudio.setAttribute("playsinline", "");
    handoffAudio.currentTime = 0;
    void handoffAudio.play().catch(() => {});
  } catch {
    return false;
  }
  return true;
}

function stopHandoffAudio() {
  try {
    handoffAudio?.pause();
  } catch {
    /* 忽略 */
  }
}

/** 测试用 */
export function resetHandoffForTests() {
  handoffAudio = null;
  lastHandoff = 0;
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakOutcome> {
  // 第一个 await 之前同步开始静音播放，仍在用户点击的事件里
  const wait = opts.handoff ? startHandoff() : false;
  try {
    if (wait) {
      await new Promise((r) => setTimeout(r, HANDOFF_WAIT_MS));
      stopHandoffAudio();
    }
    return await speakInner(text, opts);
  } catch (e) {
    // 浏览器的语音接口抛异常时也要给出提示，不能让播放按钮一直停在「播放中」
    return { ok: false, reason: `语音播放出错（${e instanceof Error ? e.message : String(e)}）。` };
  }
}

async function speakInner(text: string, opts: SpeakOptions): Promise<SpeakOutcome> {
  if (!speechSupported()) return { ok: false, reason: "当前浏览器不支持语音合成（Web Speech API）。" };
  const voices = await loadVoices();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.voiceURI);
  if (voice) u.voice = voice;
  else if (voices.length) return { ok: false, reason: "系统里没有可用的英文语音。请在「系统设置 → 辅助功能 → 朗读内容」中添加英文语音。" };
  u.lang = voice?.lang ?? "en-US";
  u.rate = opts.rate ?? 0.95;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SpeakOutcome) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    u.onstart = () => finish({ ok: true });
    u.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") finish({ ok: true });
      else finish({ ok: false, reason: `语音播放失败（${err || "未知错误"}）。` });
    };
    synth.speak(u);
    setTimeout(() => {
      if (!settled) {
        synth.cancel();
        finish({ ok: false, reason: "语音没有开始播放。可能是浏览器限制了自动播放，或系统语音不可用。" });
      }
    }, 4000);
  });
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
