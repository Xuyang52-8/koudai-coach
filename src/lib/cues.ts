/**
 * 陪练短口令（v1.5「循环陪练」）：
 * 做组期间循环朗读的短口令，教练喊麦风格，每句 ≤8 字，读完停 1.3s 接下一句。
 * 数据在 exercises.json 的 cues 字段；缺省时用口诀+常见错误截短兜底，保证任何动作都有得喊。
 */
import type { Exercise } from './types';

/** 取一个动作的循环口令序列（永远非空） */
export function cuesForExercise(ex: Exercise): string[] {
  if (ex.cues && ex.cues.length > 0) return ex.cues.filter(Boolean);
  const fallback = [ex.mantra, ...ex.commonMistakes.map((m) => m.split('：')[0])]
    .filter(Boolean)
    .map((s) => (s.length > 10 ? s.slice(0, 10) : s));
  return fallback.length > 0 ? fallback.slice(0, 5) : ['动作放慢', '姿势优先'];
}
