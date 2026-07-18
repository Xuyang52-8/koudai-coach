/**
 * 能力自适应引擎 —— 纯函数规则层（无 React / 无 localStorage，可单测）。
 *
 * 理念：方案难度跟着人长。按 history 里已完成的训练课数（非 REST）定级：
 *   Lv.1 新手村（<5 课）：原样，先把动作做标准
 *   Lv.2 上手期（5-12 课）：力量动作每组次数 +2，组数不变
 *   Lv.3 稳步进阶（≥13 课）：力量动作次数 +2，且前 3 个力量动作组数 +1（封顶 5 组）
 * cardio / core / warmup 类不动。
 *
 * 与 RPE 的关系：能力引擎管"整体容量随课数增长"（改课程基准 reps/sets），
 * RPE override 管"重量/次数的个性化微调"（lib/adjust.ts）。两者可同时生效：
 * 先 capability 缩放 reps（本文件，在课程解析链路里完成），再按 RPE 体系展示调整后的重量/次数。
 */
import { shiftReps } from './adjust';
import type { CycleState, Exercise } from './types';

export interface Capability {
  level: 1 | 2 | 3;
  /** 已完成训练课数（history 里非 REST 条数） */
  lessonsDone: number;
  /** '新手村' | '上手期' | '稳步进阶' */
  label: string;
  /** 一句口语化说明 */
  coachNote: string;
}

/** 容量缩放只作用于力量类；cardio/core/warmup 不动 */
const STRENGTH_CATEGORIES: ReadonlySet<string> = new Set(['pull', 'legs', 'push', 'fullbody']);

const LEVEL_META: Record<1 | 2 | 3, { label: string; coachNote: string }> = {
  1: { label: '新手村', coachNote: '先把动作做标准，重量会自己来找你' },
  2: { label: '上手期', coachNote: '动作成型了，开始给你加点量' },
  3: { label: '稳步进阶', coachNote: '你不再是新手了，强度和容量都上调' },
};

/** Lv.3 组数上调的封顶值 */
const SETS_CAP = 5;
/** Lv.3 只有前 N 个力量动作加组 */
const LV3_SETS_BUMP_COUNT = 3;
/** Lv.2/Lv.3 力量动作次数平移量 */
const REPS_DELTA = 2;

/**
 * 由循环状态定级：只数非 REST 的完成记录。
 * 0-4 课 Lv.1 · 5-12 课 Lv.2 · ≥13 课 Lv.3。
 */
export function getCapability(cycle: CycleState): Capability {
  const lessonsDone = cycle.history.filter((h) => h.workoutId !== 'REST').length;
  const level: 1 | 2 | 3 = lessonsDone >= 13 ? 3 : lessonsDone >= 5 ? 2 : 1;
  return { level, lessonsDone, ...LEVEL_META[level] };
}

/**
 * 容量缩放：返回新数组，不改原对象（未动到的动作保留原引用）。
 * Lv.1 原样（浅拷贝新数组）；Lv.2 力量动作 reps +2；Lv.3 reps +2 且前 3 个力量动作组数 +1（封顶 5 组）。
 */
export function applyCapability(exercises: Exercise[], level: 1 | 2 | 3): Exercise[] {
  if (level === 1) return [...exercises];
  let strengthSeen = 0;
  return exercises.map((ex) => {
    if (!STRENGTH_CATEGORIES.has(ex.category)) return ex;
    strengthSeen += 1;
    const reps = shiftReps(ex.reps, REPS_DELTA);
    const sets = level === 3 && strengthSeen <= LV3_SETS_BUMP_COUNT ? Math.min(SETS_CAP, ex.sets + 1) : ex.sets;
    return { ...ex, reps, sets };
  });
}
