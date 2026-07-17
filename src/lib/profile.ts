/**
 * 个性化档案纯函数：动态营养目标（Mifflin 公式）、场地优先级。
 * 数据契约见 src/lib/types.ts（UserProfile / ComputedTargets / Venue）。
 */
import type { ComputedTargets, UserProfile, Venue } from './types';

/** 场地中文标签（设置/首页展示用） */
export const VENUE_LABELS: Record<Venue, string> = {
  gym: '专业健身房',
  home: '居家',
  outdoor: '户外/街健',
  bodyweight: '纯自重',
};

/** 场地优先级：器材越丰富越优先（排课只取一个主场地） */
const VENUE_PRIORITY: Venue[] = ['gym', 'home', 'outdoor', 'bodyweight'];

/** 从用户可用场地里按优先级取第一个；空数组兜底 gym */
export function bestVenue(venues: Venue[]): Venue {
  for (const v of VENUE_PRIORITY) {
    if (venues.includes(v)) return v;
  }
  return 'gym';
}

/**
 * 由身体档案计算每日营养目标。
 * - Mifflin-St Jeor：男 bmr=10w+6.25h-5a+5，女 bmr=10w+6.25h-5a-161
 * - tdee = bmr × 1.4（练一休一活动系数）
 * - 目标热量：cut=tdee-300 / recomp=tdee-100 / bulk=tdee+200
 * - 蛋白质：cut 2.0g/kg，其余 1.8g/kg；脂肪 0.8g/kg；碳水吃剩余热量
 * 所有展示值取整（热量取整到 10，配合"约"字口吻）。
 */
export function computeTargets(p: UserProfile): ComputedTargets {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.gender === 'male' ? 5 : -161);
  const tdee = bmr * 1.4;
  const targetKcal = p.goal === 'cut' ? tdee - 300 : p.goal === 'bulk' ? tdee + 200 : tdee - 100;
  const proteinG = p.weightKg * (p.goal === 'cut' ? 2.0 : 1.8);
  const fatG = p.weightKg * 0.8;
  const carbsG = Math.max(0, (targetKcal - proteinG * 4 - fatG * 9) / 4);
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetKcal: Math.round(targetKcal / 10) * 10,
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
  };
}
