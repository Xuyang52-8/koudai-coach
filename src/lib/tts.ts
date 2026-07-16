/**
 * TTS 语音（Web Speech API）
 * zh-CN · rate 1.05 · pitch 1
 * speak() 遵守 settings.ttsOn；speakCountdown() 额外遵守 settings.ttsCountdownOn。
 * 所有语音内容必须同时有同屏文字（设计规范），语音只是增强。
 */
import { getSettings } from './store';

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => /^zh([-_]CN)?/i.test(v.lang) && /xiaoxiao|yunxi|ting|mei|hui/i.test(v.name)) ??
    voices.find((v) => /^zh([-_]CN)?/i.test(v.lang)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('zh')) ??
    null;
  return cachedVoice;
}

// 部分浏览器语音列表异步加载
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickZhVoice();
  };
}

export function ttsSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/** 停止当前朗读 */
export function cancel(): void {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
}

interface SpeakOptions {
  /** 无视全局开关强制朗读（慎用） */
  force?: boolean;
  rate?: number;
  onEnd?: () => void;
}

/**
 * 朗读一段中文文本。遵守全局 ttsOn 开关（除非 force）。
 * 新调用会顶掉正在进行的朗读，避免排队念经。
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!ttsSupported()) return;
  if (!opts.force && !getSettings().ttsOn) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = opts.rate ?? 1.05;
  utter.pitch = 1;
  const voice = pickZhVoice();
  if (voice) utter.voice = voice;
  if (opts.onEnd) utter.onend = () => opts.onEnd?.();
  speechSynthesis.speak(utter);
}

/** 倒计时专用朗读：需 ttsOn && ttsCountdownOn 同时开启 */
export function speakCountdown(text: string, opts: SpeakOptions = {}): void {
  const s = getSettings();
  if (!s.ttsOn || !s.ttsCountdownOn) return;
  speak(text, { ...opts, force: true });
}
