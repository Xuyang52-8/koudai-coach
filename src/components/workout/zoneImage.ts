/**
 * 器械 → 健身房区域线稿图匹配。
 * 按 equipment.name 关键词归类（design.md §10 资产清单）：
 *   哑铃→zone-dumbbell · 跑步机/椭圆机→zone-treadmill · 绳索/钢索→zone-cable
 *   引体/单杠/自重/瑜伽垫→zone-bodyweight · 杠铃→zone-barbell · 固定器械/插片/机→zone-machine
 */
import type { Exercise } from '../../lib/types';

export type ZoneKey = 'treadmill' | 'dumbbell' | 'barbell' | 'machine' | 'cable' | 'bodyweight';

export interface ZoneInfo {
  /** public/ 下的线稿图路径 */
  src: string;
  /** 区域名（accent Tag 用），如 "自由力量区" */
  label: string;
}

const ZONE_TABLE: Record<ZoneKey, ZoneInfo> = {
  treadmill: { src: './zone-treadmill.svg', label: '有氧区' },
  dumbbell: { src: './zone-dumbbell.svg', label: '自由力量区' },
  barbell: { src: './zone-barbell.svg', label: '自由力量区 · 深蹲架' },
  machine: { src: './zone-machine.svg', label: '固定器械区' },
  cable: { src: './zone-cable.svg', label: '龙门架绳索区' },
  bodyweight: { src: './zone-bodyweight.svg', label: '自重训练区' },
};

/** 匹配顺序敏感：自重开头优先（"自重（进阶可拿哑铃）"），再有氧，再绳索，再哑铃/杠铃，再自重关键词，最后"机"兜底固定器械。
 *  注意"坐姿划船机"是固定器械不是有氧划船机，故有氧不匹配"划船机"。 */
const MATCHERS: [RegExp, ZoneKey][] = [
  [/^自重/, 'bodyweight'],
  [/跑步机|椭圆机|有氧/, 'treadmill'],
  [/钢索|绳索|龙门架|绳把/, 'cable'],
  [/哑铃|壶铃/, 'dumbbell'],
  [/杠铃/, 'barbell'],
  [/单杠|引体|自重|瑜伽垫|徒手/, 'bodyweight'],
  [/机|插片|固定器械|凳/, 'machine'],
];

export function zoneForEquipment(equipmentName: string): ZoneInfo {
  for (const [re, key] of MATCHERS) {
    if (re.test(equipmentName)) return ZONE_TABLE[key];
  }
  return ZONE_TABLE.machine;
}

export function zoneForExercise(ex: Exercise): ZoneInfo {
  return zoneForEquipment(ex.equipment.name);
}
