/**
 * 建议重量解析 + 步进规则（workout.md §B1-6）：
 *   哑铃 ±2kg · 杠铃 ±2.5kg · 固定器械/插片 ±5kg · 自重不可调（显示文案即可）。
 * 用户调过的重量存 localStorage（koudai-coach:weights），下节课自动带出来。
 *
 * 基准重量不再直接读 exercises.json 写死值：统一走画像分档引擎 lib/weight-rec.ts
 * （recommendLoad），按性别/体重/目标/能力等级缩放；无画像或缩放后等于锚点时
 * 与旧行为完全一致。RPE 覆盖（lib/adjust.ts）的 weightDeltaKg 累加在该基准之上。
 *
 * 注意：本模块被 lib/adjust.ts import，而 lib/store.ts 又 import adjust ——
 * 因此 getProfile/getCycle/getCapability 只在函数体内调用（ESM 循环引用下安全），
 * 不要在模块顶层调用它们。
 */
import { getCapability } from '../../lib/capability';
import { getCycle, getProfile } from '../../lib/store';
import { recommendLoad } from '../../lib/weight-rec';
import type { Exercise } from '../../lib/types';

export interface WeightSpec {
  /** 画像分档后的起始 kg 数；null = 自重/不可调 */
  kg: number | null;
  /** 步进 kg */
  step: number;
  /** 重量行主显示，如 "12kg"、"8.75kg"、"自重" */
  display: string;
  /** 一行短 Tag 用，如 "哑铃 7.5kg"；自重类返回 null */
  tagText: string | null;
  /** 画像替换后的建议重量整段文案（原 suggestedWeight 的锚点数字已换成分档值） */
  note: string;
}

/** 从 suggestedWeight 里抓第一个 kg 数字："单手7.5kg哑铃开始" → 7.5 */
export function parseKg(suggestedWeight: string): number | null {
  const m = suggestedWeight.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 器械短名（Tag 用）：优先取含负重器械的段——"平板凳+哑铃（可选）" → "哑铃"；"哑铃+平板凳" → "哑铃" */
function shortEquipName(name: string): string {
  const parts = name.split('+').map((p) => p.trim());
  const weighted = parts.find((p) => /哑铃|杠铃|壶铃/.test(p));
  return (weighted ?? parts[0]).split('（')[0].trim();
}

/**
 * 画像分档后的重量规格：基准 = recommendLoad（读 store 里的 profile + cycle 定级）。
 * 无画像 / 缩放后等于锚点时，与改造前的写死推荐完全一致。
 */
export function weightSpec(ex: Exercise): WeightSpec {
  const rec = recommendLoad(ex, getProfile(), getCapability(getCycle()).level);
  if (rec.kg === null) return { kg: null, step: 0, display: '自重', tagText: null, note: rec.base };
  return {
    kg: rec.kg,
    step: rec.stepKg,
    display: formatKg(rec.kg),
    tagText: `${shortEquipName(ex.equipment.name)} ${formatKg(rec.kg)}`,
    note: rec.base,
  };
}

/** 步进下限：不降到 0 以下，最小 1kg（空杆/小哑铃从 1 开始也有意义） */
export function clampWeight(v: number): number {
  return Math.max(1, Math.round(v * 10) / 10);
}

/** kg 展示：整数不带小数，否则最多两位（8.75 → "8.75kg"，7.5 → "7.5kg"，20 → "20kg"） */
export function formatKg(v: number): string {
  return `${Math.round(v * 100) / 100}kg`;
}
