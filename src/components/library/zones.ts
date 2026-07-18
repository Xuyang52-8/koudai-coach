/**
 * 器械区域（动作库分类）
 * Exercise 类型没有 zone 字段，这里按 equipment.name / category 推导内置动作的区域；
 * 自建动作把区域编码进 category：'zone:<id>'（类型允许 string），读取时解析回来。
 */
import type { Exercise } from '@/lib/types';

export type ZoneId = 'cardio' | 'dumbbell' | 'barbell' | 'machine' | 'cable' | 'bodyweight';

export interface ZoneDef {
  id: ZoneId;
  /** 区域名，如 "哑铃区" */
  name: string;
  /** 口语定位描述（用户不认识器械） */
  caption: string;
  /** 线稿图（public/ 下） */
  svg: string;
}

export const ZONES: ZoneDef[] = [
  { id: 'cardio', name: '有氧区', caption: '跑步机/椭圆机，进门最显眼那排', svg: './zone-treadmill.svg' },
  { id: 'dumbbell', name: '哑铃区', caption: '自由力量区那排哑铃架', svg: './zone-dumbbell.svg' },
  { id: 'barbell', name: '杠铃区', caption: '深蹲架/卧推架', svg: './zone-barbell.svg' },
  { id: 'machine', name: '固定器械区', caption: '带配重片的大家伙们', svg: './zone-machine.svg' },
  { id: 'cable', name: '绳索区', caption: '龙门架，两边有滑轮', svg: './zone-cable.svg' },
  { id: 'bodyweight', name: '自重区', caption: '单杠/双杠/垫子', svg: './zone-bodyweight.svg' },
];

export const ZONE_MAP: Record<ZoneId, ZoneDef> = Object.fromEntries(
  ZONES.map((z) => [z.id, z]),
) as Record<ZoneId, ZoneDef>;

/** 自建动作 category 编码前缀 */
export const CUSTOM_ZONE_PREFIX = 'zone:';

export function encodeCustomCategory(zone: ZoneId): string {
  return CUSTOM_ZONE_PREFIX + zone;
}

function decodeCustomZone(category: string): ZoneId | null {
  if (!category.startsWith(CUSTOM_ZONE_PREFIX)) return null;
  const id = category.slice(CUSTOM_ZONE_PREFIX.length) as ZoneId;
  return id in ZONE_MAP ? id : null;
}

/**
 * 推导动作所属区域。
 * 关键词顺序即优先级：钢索先于"机"（高位钢索机），自重先于哑铃（自重进阶可拿哑铃）。
 */
export function zoneOfExercise(ex: Exercise): ZoneId {
  const custom = decodeCustomZone(ex.category);
  if (custom) return custom;
  if (ex.category === 'cardio') return 'cardio';
  const eq = ex.equipment.name;
  if (/跑步机|椭圆机|动感单车|风阻单车/.test(eq)) return 'cardio';
  if (/钢索|绳索|绳把|龙门架|拉力器/.test(eq)) return 'cable';
  if (/杠铃/.test(eq)) return 'barbell';
  if (/自重|单杠|双杠|瑜伽垫|垫上|弹力带/.test(eq)) return 'bodyweight';
  if (/哑铃|壶铃|卧推凳|平板凳/.test(eq)) return 'dumbbell';
  if (/机/.test(eq)) return 'machine';
  return 'bodyweight';
}
