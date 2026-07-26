/**
 * 动作教学视频：B 站深链直达（v1.5）。
 * 有 videoBv → bilibili://video/{BV} 精确到片；缺省 → bilibili://search 关键词（都直接拉起 B 站 App）。
 * 拉起失败（没装 App / 网页端拦截）→ 1.4s 后退回网页版搜索/BV 页。
 */
import type { Exercise } from './types';

export function exerciseVideoWebUrl(ex: Exercise): string {
  if (ex.videoBv) return `https://www.bilibili.com/video/${ex.videoBv}`;
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(ex.videoKeyword)}`;
}

/** 打开动作教学视频：优先拉起哔哩哔哩 App，失败退回网页版 */
export function openExerciseVideo(ex: Exercise): void {
  const deep = ex.videoBv
    ? `bilibili://video/${ex.videoBv}`
    : `bilibili://search?keyword=${encodeURIComponent(ex.videoKeyword)}`;
  const start = Date.now();
  try {
    window.location.href = deep;
  } catch {
    window.open(exerciseVideoWebUrl(ex), '_blank', 'noopener,noreferrer');
    return;
  }
  window.setTimeout(() => {
    // 页面没被切走（说明没拉起 App）→ 网页版兜底
    if (Date.now() - start < 2400 && !document.hidden) {
      window.open(exerciseVideoWebUrl(ex), '_blank', 'noopener,noreferrer');
    }
  }, 1400);
}
