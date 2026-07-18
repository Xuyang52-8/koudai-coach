/**
 * 锁屏音频保活（安卓优先，尽力而为）：
 * 训练进行中循环播放一段代码生成的静音 WAV，并设置 Media Session metadata，
 * 让系统把页面当音乐 App——锁屏后 JS 计时与 TTS 大概率继续跑。
 * iOS 受系统限制效果有限。所有环节 try/catch，任何环境不支持都不影响训练流程。
 *
 * 用法（Workout 页）：
 *   useBgAudioKeepAlive(settings.bgAudioKeepAlive ?? true, ex?.name ?? '热身');
 */
import { useEffect, useRef } from 'react';

/* ---------- 静音 WAV（44 字节头 + 静音帧，data URI） ---------- */

let cachedWavUri: string | null = null;

/** 生成 1 秒 8kHz 16bit 单声道静音 WAV 的 data URI（循环播放用）。失败返回空串。 */
export function silentWavDataUri(): string {
  if (cachedWavUri) return cachedWavUri;
  try {
    const sampleRate = 8000;
    const numSamples = sampleRate; // 1 秒
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeAscii = (offset: number, s: string): void => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt 块大小
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // 单声道
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // 字节率
    view.setUint16(32, 2, true); // 块对齐
    view.setUint16(34, 16, true); // 位深
    writeAscii(36, 'data');
    view.setUint32(40, dataSize, true);
    // 采样区保持 0 = 静音（ArrayBuffer 初始即为 0）
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x2000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    cachedWavUri = `data:audio/wav;base64,${btoa(binary)}`;
    return cachedWavUri;
  } catch {
    return '';
  }
}

/* ---------- 保活 Hook ---------- */

/**
 * @param active 训练进行中且开关打开（Workout 页挂载且 session 已存在）
 * @param artist Media Session 的 artist 字段：跟随当前动作名，切换动作自动更新
 */
export function useBgAudioKeepAlive(active: boolean, artist: string): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* 静音循环音频：active 时播放；自动播放策略下首次用户手势后重试；回可见时补播；失活/卸载即停 */
  useEffect(() => {
    if (!active) return;
    if (typeof Audio === 'undefined') return;
    let audio = audioRef.current;
    if (!audio) {
      const src = silentWavDataUri();
      if (!src) return;
      try {
        audio = new Audio(src);
        audio.loop = true;
        audio.preload = 'auto';
        audioRef.current = audio;
      } catch {
        return;
      }
    }
    const el = audio;
    const tryPlay = (): void => {
      try {
        if (!el.paused) return;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* 自动播放限制等：静默 */
      }
    };
    tryPlay();
    const onGesture = (): void => tryPlay();
    const onVis = (): void => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    window.addEventListener('pointerdown', onGesture);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('visibilitychange', onVis);
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    };
  }, [active]);

  /* Media Session metadata：标题固定「口袋私教 · 训练中」，artist 跟随当前动作名 */
  useEffect(() => {
    if (!active) return;
    try {
      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '口袋私教 · 训练中',
          artist,
          album: '口袋私教',
        });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch {
      /* 不支持：静默 */
    }
    return () => {
      try {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        }
      } catch {
        /* ignore */
      }
    };
  }, [active, artist]);
}
