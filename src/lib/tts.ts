/**
 * 全局 TTS：zh-CN、语速 1.05、默认低音量的"教练在你耳边"。
 * 遵守用户设置：ttsOn=false 时所有朗读（除 force）都静默。
 * 读秒走 speakCountdown（需 ttsOn && ttsCountdownOn），自动 cancel 冲突。
 *
 * 无声问题修复（v4）：
 * 1. voices 异步加载：首次 getVoices() 常为空 → onvoiceschanged 缓存 + 兜底不指定 voice
 * 2. iOS/安卓手势锁：unlockTTS() 在首次 pointerdown 发静音占位语音解锁
 * 3. iOS cancel-then-speak 静默 bug：cancel 后延迟 60ms 再 speak
 * 4. Chrome 长文本 15s 暂停 bug：按句切分排队朗读
 */

import { getSettings } from './store';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ---------- 语音列表缓存 ---------- */

let voicesCache: SpeechSynthesisVoice[] = [];
let cachedZhVoice: SpeechSynthesisVoice | null | undefined;

function refreshVoices(): void {
  if (!ttsSupported()) return;
  try {
    voicesCache = window.speechSynthesis.getVoices();
    cachedZhVoice = undefined;
  } catch {
    /* ignore */
  }
}

if (ttsSupported()) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (cachedZhVoice !== undefined) return cachedZhVoice;
  if (!voicesCache.length) refreshVoices();
  cachedZhVoice =
    voicesCache.find((v) => /^zh/i.test(v.lang) && /xiaoxiao|yunxi|ting|mei|hui|yaoyao|kangkang|google.*(普通话|中文)/i.test(v.name)) ??
    voicesCache.find((v) => /^zh[-_]?CN/i.test(v.lang)) ??
    voicesCache.find((v) => /^zh/i.test(v.lang)) ??
    null;
  return cachedZhVoice;
}

/* ---------- 手势解锁 ---------- */

let unlocked = false;

/** 首次用户手势时调用（main.tsx 注册一次）：解锁移动端语音并触发语音列表加载。 */
export function unlockTTS(): void {
  if (!ttsSupported() || unlocked) return;
  unlocked = true;
  try {
    refreshVoices();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

/* ---------- 朗读 ---------- */

export function cancel(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

interface SpeakOptions {
  force?: boolean;
  rate?: number;
  onEnd?: () => void;
}

function doSpeak(text: string, opts: SpeakOptions): void {
  const synth = window.speechSynthesis;
  // iOS：cancel 后立刻 speak 会静默失败，延迟 60ms
  synth.cancel();
  window.setTimeout(() => {
    try {
      const voice = pickZhVoice();
      const chunks = text
        .split(/(?<=[。！？!?；;\n])/)
        .map((s) => s.trim())
        .filter(Boolean);
      const queue = chunks.length ? chunks : [text];
      let last: SpeechSynthesisUtterance | null = null;
      for (const chunk of queue) {
        const utter = new SpeechSynthesisUtterance(chunk);
        utter.lang = 'zh-CN';
        utter.rate = opts.rate ?? 1.05;
        utter.pitch = 1;
        if (voice) utter.voice = voice;
        utter.onerror = (e) => console.warn('[tts] speak error:', e.error);
        last = utter;
        synth.speak(utter);
      }
      if (last && opts.onEnd) {
        (last as SpeechSynthesisUtterance).onend = () => opts.onEnd?.();
      }
    } catch (e) {
      console.warn('[tts] speak failed:', e);
    }
  }, 60);
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!ttsSupported()) return;
  if (!opts.force && !getSettings().ttsOn) return;
  doSpeak(text, opts);
}

export function speakCountdown(text: string, opts: SpeakOptions = {}): void {
  if (!ttsSupported()) return;
  const s = getSettings();
  if (!s.ttsOn || !s.ttsCountdownOn) return;
  doSpeak(text, { ...opts, rate: 1.15 });
}
