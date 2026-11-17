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

export function englishVoices(voices: SpeechSynthesisVoice[] = voicesCache): SpeechSynthesisVoice[] {
  return voices.filter((v) => /^en[-_]/i.test(v.lang));
}

function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const en = englishVoices();
  return (
    en.find((v) => v.voiceURI === voiceURI) ??
    en.find((v) => /en[-_]US/i.test(v.lang) && /Samantha|Alex|Ava|Allison|Google US/i.test(v.name)) ??
    en.find((v) => /en[-_]US/i.test(v.lang)) ??
    en[0]
  );
}

/**
 * 朗读一句英文。播放成功开始返回 ok；不支持 / 没有英文语音 / 出错 / 超时没有开始播放时返回原因。
 */
export async function speak(text: string, opts: { rate?: number; voiceURI?: string } = {}): Promise<SpeakOutcome> {
  try {
    return await speakInner(text, opts);
  } catch (e) {
    // 浏览器的语音接口抛异常时也要给出提示，不能让播放按钮一直停在「播放中」
    return { ok: false, reason: `语音播放出错（${e instanceof Error ? e.message : String(e)}）。` };
  }
}

async function speakInner(text: string, opts: { rate?: number; voiceURI?: string }): Promise<SpeakOutcome> {
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
