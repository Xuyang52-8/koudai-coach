/**
 * 画像分档重量推荐引擎 —— 纯函数（无 React / 无 localStorage，可单测）。
 *
 * 背景：exercises.json 的 suggestedWeight 是按创建者画像（男 / 约 80kg / 零基础）写死的，
 * 直接推给其他人（如女生）会离谱。本引擎把原始字符串里的 kg 数值当作
 * 「男性 75-85kg · 零基础 · Lv.1」的基准锚点，按画像缩放：
 *
 *   性别    女性 ×0.6；上肢推类（category === 'push'）女性再 ×0.85（上肢力量差距更大）
 *   体重    每偏离 80kg 10kg ×(1±0.1)，即 1+(w-80)/100，clamp 到 [0.6, 1.4]
 *   能力    Lv.2 ×1.15 · Lv.3 ×1.3（等级由 capability.ts 按已完成课数定）
 *   目标    cut ×0.95（减脂期保守）· bulk ×1.05（增肌期激进一点）· recomp ×1
 *
 * 结果取整到 1.25kg（健身房最小片），再应用器械物理下限：
 *   杠铃类 ≥ 空杆 20kg（史密斯 ≥ 10kg）· 哑铃/壶铃 ≥ 2kg · 插片/钢索器械 ≥ 5kg
 *
 * 特例：
 *   - 辅助类重量（字符串含「辅助」，如辅助引体机）数值越大越轻松，反向缩放 ×(2-factor)；
 *   - 自重 / 无 kg 数值的字符串（"自重"、"阻力3-5档"、"坡度12、速度4km/h"）原样返回，stepKg=0；
 *   - 缩放后等于锚点（如男 80kg Lv.1）时不改写文案，原字符串原样返回。
 *
 * 与 RPE 的关系：本引擎输出的是「基准建议」，RPE 覆盖（lib/adjust.ts）的 weightDeltaKg
 * 是在这个基准之上累加的绝对 kg 偏移，不重复缩放。
 */
import type { Exercise, UserProfile } from './types';

export interface LoadRecommendation {
  /** 推荐后的重量描述：锚点数字被替换为分档值；系数≈1 或自重/不可解析时为原字符串 */
  base: string;
  /** 推荐起始 kg（步进器初值基准）；自重/不可解析为 null */
  kg: number | null;
  /** 步进 kg（步进器 ±一档）；自重/不可解析为 0 */
  stepKg: number;
}

/** 健身房最小片 1.25kg，所有推荐值取整到它的倍数 */
const PLATE_KG = 1.25;
/** 锚点画像：男性 80kg（原始数据按 75-85kg 男性零基础编写，取中值） */
const ANCHOR_WEIGHT_KG = 80;

/* ================= 系数 ================= */

/** 体重系数：每偏离 80kg 10kg ×(1∓0.1)，clamp [0.6, 1.4] */
export function bodyWeightFactor(weightKg: number): number {
  const f = 1 + (weightKg - ANCHOR_WEIGHT_KG) / 100;
  return Math.min(1.4, Math.max(0.6, f));
}

/** 能力等级系数：Lv.1 ×1 · Lv.2 ×1.15 · Lv.3 ×1.3 */
export function levelFactor(level: 1 | 2 | 3): number {
  return level === 3 ? 1.3 : level === 2 ? 1.15 : 1;
}

/** 总缩放系数（无档案时恒 1 = 维持原始数据，老用户无感升级） */
export function totalFactor(ex: Exercise, profile: UserProfile | null, level: 1 | 2 | 3): number {
  let f = levelFactor(level);
  if (profile) {
    if (profile.gender === 'female') {
      f *= 0.6;
      // 上肢推类女性力量差距更大，额外降一档
      if (ex.category === 'push') f *= 0.85;
    }
    f *= bodyWeightFactor(profile.weightKg);
    f *= profile.goal === 'cut' ? 0.95 : profile.goal === 'bulk' ? 1.05 : 1;
  }
  return f;
}

/* ================= 解析与取整 ================= */

/** 锚点：kg 前的数字（"插片15-20kg" 取上限 20，与 components/workout/weight.ts parseKg 同规则） */
const KG_ANCHOR = /(\d+(?:\.\d+)?)\s*kg/i;
/** 含范围的整段（"15-20kg" / "20kg"），替换文案时用 */
const KG_SEGMENT = /(?:\d+(?:\.\d+)?\s*[-–~]\s*)?\d+(?:\.\d+)?\s*kg/i;

export function parseAnchorKg(suggestedWeight: string): number | null {
  const m = suggestedWeight.match(KG_ANCHOR);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 取整到 1.25kg 的倍数，并清掉浮点尾巴（8.7500000001 → 8.75） */
function roundToPlate(v: number): number {
  return Math.round(Math.round(v / PLATE_KG) * PLATE_KG * 100) / 100;
}

/** 器械物理下限：杠铃不低于空杆、哑铃不低于 2kg、插片/钢索器械不低于 5kg */
function floorFor(ex: Exercise): number {
  const n = ex.equipment.name;
  if (/史密斯/.test(n)) return 10; // 史密斯空杆约 10kg
  if (/杠铃/.test(n)) return 20; // 标准空杆 20kg
  if (/哑铃|壶铃/.test(n)) return 2;
  if (/机|插片|钢索|绳索/.test(n)) return 5;
  return PLATE_KG;
}

/**
 * 步进档：沿用原规则（杠铃 ±2.5 · 哑铃/壶铃 ±2 · 器械 ±5）。
 * 画像下调后基准偏小（<20kg）时，可加片的器械步进减半（最低 1.25）——
 * 否则 8.75kg 的配重一步 ±5kg 没法用；哑铃受架档物理限制保持 ±2。
 */
function stepFor(ex: Exercise, factor: number, kg: number): number {
  const n = ex.equipment.name;
  let base: number;
  if (/杠铃/.test(n)) base = 2.5;
  else if (/哑铃|壶铃/.test(n)) base = 2;
  else if (/机|插片|钢索|绳索/.test(n)) base = 5;
  else base = 2.5;
  if (factor < 1 && kg < 20 && !/哑铃|壶铃/.test(n)) base = Math.max(PLATE_KG, base / 2);
  return base;
}

function numStr(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/* ================= 主函数 ================= */

/**
 * 按画像推荐起始重量与步进。
 * @param ex      动作（读 suggestedWeight / equipment.name / category）
 * @param profile 用户档案，null = 不缩放（老用户/未填问卷回落原始数据）
 * @param level   能力等级（capability.getCapability(cycle).level）
 */
export function recommendLoad(ex: Exercise, profile: UserProfile | null, level: 1 | 2 | 3): LoadRecommendation {
  const raw = ex.suggestedWeight;
  // 自重 / 明确无负重：原样
  if (/自重/.test(raw)) return { base: raw, kg: null, stepKg: 0 };
  const anchor = parseAnchorKg(raw);
  // 无数值可解析（"阻力3-5档"、"中等阻力起步"）：原样
  if (anchor === null) return { base: raw, kg: null, stepKg: 0 };

  const factor = totalFactor(ex, profile, level);
  // 辅助类重量（辅助引体机等）：数值越大越轻松，反向缩放
  const assisted = /辅助/.test(raw);
  const scaled = assisted ? anchor * (2 - factor) : anchor * factor;
  const kg = assisted ? roundToPlate(scaled) : Math.max(floorFor(ex), roundToPlate(scaled));
  const stepKg = stepFor(ex, factor, kg);

  // 缩放后等于锚点（男 75-85kg Lv.1 recomp）：文案不动，完全等价旧行为
  if (kg === anchor) return { base: raw, kg, stepKg };
  // 否则把锚点段（含 "15-20kg" 范围）替换为分档值，其余口语说明保留
  return { base: raw.replace(KG_SEGMENT, `${numStr(kg)}kg`), kg, stepKg };
}
