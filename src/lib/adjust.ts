/**
 * RPE 自适应强度系统 —— 纯函数规则层（无 React / 无 localStorage，可单测）。
 *
 * 教练规则（定死，别自由发挥）：
 *   太轻松：器械/哑铃类 weightDeltaKg +2.5（当前重量≥20kg 时 +5）；自重类 repsDelta +2
 *   刚好：  不变，hardStreak 清零
 *   太累：  weightDeltaKg -2.5（≥20kg 时 -5，总量不低于基准 50%）；
 *           自重类 repsDelta -2（不低于基准次数下限的 60%）；hardStreak +1
 *
 * 覆盖记录存 localStorage：koudai-coach:exoverride:{exerciseId}（读写见 lib/store.ts）。
 */
import { clampWeight, formatKg, weightSpec } from '../components/workout/weight';
import type { WeightSpec } from '../components/workout/weight';
import type { Exercise } from './types';

/* ================= 类型（约定直接写在本文件，不进 lib/types.ts） ================= */

export type RpeChoice = 'easy' | 'ok' | 'hard';

export interface RpeHistoryEntry {
  /** YYYY-MM-DD 本地日期 */
  date: string;
  rpe: RpeChoice;
}

/** koudai-coach:exoverride:{exerciseId} 的存储结构 */
export interface ExerciseOverride {
  /** 相对基准建议重量的累计偏移（kg），自重类恒为 0 */
  weightDeltaKg: number;
  /** 相对基准次数的累计偏移，负重类恒为 0 */
  repsDelta: number;
  lastRpe: RpeChoice;
  /** 连续「太累」次数：刚好清零；≥2 时提示可换替代动作降档 */
  hardStreak: number;
  updatedAt: number;
  /** 只留最近 10 条 */
  history: RpeHistoryEntry[];
}

export const RPE_LABELS: Record<RpeChoice, string> = {
  easy: '太轻松',
  ok: '刚好',
  hard: '太累',
};

const HISTORY_MAX = 10;
/** 重量调整档位切换线：当前重量 ≥20kg 时按 ±5kg 走，否则 ±2.5kg */
const HEAVY_KG = 20;
const STEP_SMALL_KG = 2.5;
const STEP_BIG_KG = 5;
/** 太累下限：重量不低于基准的 50% */
const WEIGHT_FLOOR_RATIO = 0.5;
/** 太累下限：次数下限不低于基准下限的 60% */
const REPS_FLOOR_RATIO = 0.6;
const REPS_STEP = 2;

function dateOf(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ================= reps 字符串平移 ================= */

/** reps 的「目标段」：首个 （/（/， 之前的部分，如 "每侧10-12" / "8-15" / "力竭前留1个" */
function repsHead(reps: string): string {
  const m = reps.match(/^[^（(,，]*/);
  return m ? m[0] : reps;
}

/** 目标段是否可平移：含数字、且不是力竭/时长/距离类 */
function isShiftableHead(head: string): boolean {
  if (!/\d/.test(head)) return false; // "每组吊到力竭"
  if (/力竭/.test(head)) return false; // "力竭前留1个"
  if (/分钟|秒|米/.test(head)) return false; // "5分钟" "30-45秒" "往返走30-40米"
  return true;
}

/**
 * 次数平移："10-12"±2 → 两边同加减，下限 ≥1；只动目标段。
 * "每侧10-12（左侧先做…）" +2 → "每侧12-14（左侧先做…）"；
 * "力竭" / "5分钟" / "30-60秒" / "力竭前留1个（目前每组2-4个）" 等非计次数不动。
 */
export function shiftReps(reps: string, delta: number): string {
  if (delta === 0) return reps;
  const head = repsHead(reps);
  if (!isShiftableHead(head)) return reps;
  const shifted = head.replace(/\d+/g, (d) => String(Math.max(1, Number(d) + delta)));
  return shifted + reps.slice(head.length);
}

/** 基准次数下限（"10-12" → 10；"每侧8-10步" → 8）；不可平移类返回 null */
export function repsLowerBound(reps: string): number | null {
  const head = repsHead(reps);
  if (!isShiftableHead(head)) return null;
  const m = head.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** 次数目标段（去掉括号补充说明），如 "每侧10-12" / "12-15" / "力竭前留1个" */
export function repsTarget(reps: string): string {
  return repsHead(reps).trim();
}

/* ================= 规则核心：应用一次 RPE ================= */

function blankOverride(rpe: RpeChoice, now: number): ExerciseOverride {
  return { weightDeltaKg: 0, repsDelta: 0, lastRpe: rpe, hardStreak: 0, updatedAt: now, history: [] };
}

/**
 * 纯函数：根据上一次覆盖记录 + 本次评价，算出新的覆盖记录。
 * @param prev 无记录传 null
 * @param now  注入时间戳便于测试
 */
export function applyRpe(prev: ExerciseOverride | null, ex: Exercise, rpe: RpeChoice, now: number = Date.now()): ExerciseOverride {
  const base = prev ?? blankOverride(rpe, now);
  const spec = weightSpec(ex);
  const baseKg = spec.kg;
  const next: ExerciseOverride = {
    ...base,
    lastRpe: rpe,
    updatedAt: now,
    history: [...base.history, { date: dateOf(now), rpe }].slice(-HISTORY_MAX),
  };

  if (rpe === 'easy') {
    if (baseKg !== null) {
      const current = baseKg + base.weightDeltaKg;
      next.weightDeltaKg = base.weightDeltaKg + (current >= HEAVY_KG ? STEP_BIG_KG : STEP_SMALL_KG);
    } else {
      next.repsDelta = base.repsDelta + REPS_STEP;
    }
    return next;
  }

  if (rpe === 'ok') {
    next.hardStreak = 0;
    return next;
  }

  /* hard */
  next.hardStreak = base.hardStreak + 1;
  if (baseKg !== null) {
    const current = baseKg + base.weightDeltaKg;
    let delta = base.weightDeltaKg - (current >= HEAVY_KG ? STEP_BIG_KG : STEP_SMALL_KG);
    // 总量不得低于基准的 50%
    const minDelta = Math.ceil(-baseKg * WEIGHT_FLOOR_RATIO * 10) / 10;
    if (delta < minDelta) delta = minDelta;
    next.weightDeltaKg = delta;
  } else {
    let delta = base.repsDelta - REPS_STEP;
    // 次数下限不得低于基准下限的 60%（基准下限解析不出来时不设限）
    const lower = repsLowerBound(ex.reps);
    if (lower !== null) {
      const minLower = Math.max(1, Math.floor(lower * REPS_FLOOR_RATIO));
      if (lower + delta < minLower) delta = minLower - lower;
    }
    next.repsDelta = delta;
  }
  return next;
}

/* ================= 展示层：调整后读数 ================= */

/** 是否有实际调整量（刚好/首次评价没有量，不亮「已为你调整」Tag） */
export function hasAdjustment(ov: ExerciseOverride | null): boolean {
  return ov !== null && (ov.weightDeltaKg !== 0 || ov.repsDelta !== 0);
}

/** 调整后的重量规格：无覆盖/无调整/自重类时等于基准 weightSpec */
export function adjustedWeightSpec(ex: Exercise, ov: ExerciseOverride | null): WeightSpec {
  const spec = weightSpec(ex);
  if (spec.kg === null || !ov || ov.weightDeltaKg === 0) return spec;
  const kg = clampWeight(spec.kg + ov.weightDeltaKg);
  return {
    ...spec,
    kg,
    display: formatKg(kg),
    tagText: spec.tagText ? spec.tagText.replace(formatKg(spec.kg), formatKg(kg)) : null,
  };
}

/** 调整后的重量 kg 数（自重类 null），步进器初值直接用 */
export function adjustedWeightKg(ex: Exercise, ov: ExerciseOverride | null): number | null {
  return adjustedWeightSpec(ex, ov).kg;
}

/** 调整后的次数文案（无覆盖/不可平移时等于原 reps） */
export function adjustedReps(ex: Exercise, ov: ExerciseOverride | null): string {
  if (!ov || ov.repsDelta === 0) return ex.reps;
  return shiftReps(ex.reps, ov.repsDelta);
}

/* ================= 文案 ================= */

/** toast 用的次数短语：平移后的目标段，如 "12-14" / "每侧12-14" / "15次"；不可平移返回 null */
function repsToastTarget(ex: Exercise, ov: ExerciseOverride): string | null {
  const shifted = shiftReps(ex.reps, ov.repsDelta);
  if (shifted === ex.reps) return null;
  return repsHead(shifted).trim();
}

/**
 * 选完 RPE 的 toast（design.md §8 口吻：私教学长，短句）。
 * hardStreak≥2 追加替代动作降档提示。
 */
export function rpeToast(ex: Exercise, next: ExerciseOverride, rpe: RpeChoice): string {
  const spec = adjustedWeightSpec(ex, next);
  let msg: string;
  if (rpe === 'easy') {
    if (spec.kg !== null) {
      msg = `记下了，下次加到 ${formatKg(spec.kg)}`;
    } else {
      const t = repsToastTarget(ex, next);
      msg = t ? `记下了，下次加到 ${t}` : '记下了，下次给你加点量';
    }
  } else if (rpe === 'ok') {
    msg = '好，保持这个量，稳住';
  } else {
    if (spec.kg !== null) {
      msg = `记下了，下次减到 ${formatKg(spec.kg)}，姿势先对`;
    } else {
      const t = repsToastTarget(ex, next);
      msg = t ? `记下了，下次减到 ${t}，姿势先对` : '记下了，下次减点量，姿势先对';
    }
    if (next.hardStreak >= 2) {
      msg += '。连续喊累啦，下次可以点「换替代动作」降一档难度';
    }
  }
  return msg;
}

/** 设置页「当前调整量」一行：如 "重量 +2.5kg"、"次数 -2"、"基准量，还没动" */
export function overrideDeltaText(ex: Exercise | null, ov: ExerciseOverride): string {
  const parts: string[] = [];
  const spec = ex ? weightSpec(ex) : null;
  const weighted = spec ? spec.kg !== null : ov.weightDeltaKg !== 0;
  if (ov.weightDeltaKg !== 0 && weighted) {
    parts.push(`重量 ${ov.weightDeltaKg > 0 ? '+' : ''}${formatKg(ov.weightDeltaKg)}`);
  }
  if (ov.repsDelta !== 0) {
    parts.push(`次数 ${ov.repsDelta > 0 ? '+' : ''}${ov.repsDelta}`);
  }
  if (parts.length === 0 && ov.weightDeltaKg !== 0) {
    // 动作已找不到/类型变了，兜底仍展示重量偏移
    parts.push(`重量 ${ov.weightDeltaKg > 0 ? '+' : ''}${formatKg(ov.weightDeltaKg)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '基准量，还没动';
}
