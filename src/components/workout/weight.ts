/**
 * 建议重量解析 + 步进规则（workout.md §B1-6）：
 *   哑铃 ±2kg · 杠铃 ±2.5kg · 固定器械/插片 ±5kg · 自重不可调（显示文案即可）。
 * 用户调过的重量存 localStorage（koudai-coach:weights），下节课自动带出来。
 */
import type { Exercise } from '../../lib/types';

export interface WeightSpec {
  /** 解析出的初始 kg 数；null = 自重/不可调 */
  kg: number | null;
  /** 步进 kg */
  step: number;
  /** 重量行主显示，如 "12kg"、"自重" */
  display: string;
  /** 一行短 Tag 用，如 "哑铃 7.5kg"；自重类返回 null */
  tagText: string | null;
}

/** 从 suggestedWeight 里抓第一个 kg 数字："单手7.5kg哑铃开始" → 7.5 */
export function parseKg(suggestedWeight: string): number | null {
  const m = suggestedWeight.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function stepFor(ex: Exercise): number {
  const n = ex.equipment.name;
  if (/杠铃/.test(n)) return 2.5;
  if (/哑铃|壶铃/.test(n)) return 2;
  if (/机|插片|钢索|绳索/.test(n)) return 5;
  return 2.5;
}

/** 器械短名（Tag 用）：优先取含负重器械的段——"平板凳+哑铃（可选）" → "哑铃"；"哑铃+平板凳" → "哑铃" */
function shortEquipName(name: string): string {
  const parts = name.split('+').map((p) => p.trim());
  const weighted = parts.find((p) => /哑铃|杠铃|壶铃/.test(p));
  return (weighted ?? parts[0]).split('（')[0].trim();
}

export function weightSpec(ex: Exercise): WeightSpec {
  const kg = parseKg(ex.suggestedWeight);
  if (kg === null) return { kg: null, step: 0, display: '自重', tagText: null };
  const step = stepFor(ex);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return {
    kg,
    step,
    display: `${fmt(kg)}kg`,
    tagText: `${shortEquipName(ex.equipment.name)} ${fmt(kg)}kg`,
  };
}

/** 步进下限：不降到 0 以下，最小 1kg（空杆/小哑铃从 1 开始也有意义） */
export function clampWeight(v: number): number {
  return Math.max(1, Math.round(v * 10) / 10);
}

export function formatKg(v: number): string {
  return `${Number.isInteger(v) ? String(v) : v.toFixed(1)}kg`;
}
