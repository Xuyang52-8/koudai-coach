/**
 * 场地（Venue）工具：动作库场地筛选 + 行内场地标签共用。
 * 场地文案：gym=健身房 home=居家 outdoor=户外 bodyweight=自重。
 * venues 缺失的老数据视为全部场地可见、不显示场地标签。
 */
import type { Exercise, Venue } from '@/lib/types';

export const VENUE_LABELS: Record<Venue, string> = {
  gym: '健身房',
  home: '居家',
  outdoor: '户外',
  bodyweight: '自重',
};

export type VenueFilter = Venue | 'all';

/** 动作库筛选 chips：全部 / 健身房 / 居家 / 户外 / 纯自重 */
export const VENUE_FILTERS: { id: VenueFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'gym', label: '健身房' },
  { id: 'home', label: '居家' },
  { id: 'outdoor', label: '户外' },
  { id: 'bodyweight', label: '纯自重' },
];

/** 自建表单场地多选选项 */
export const VENUE_OPTIONS: { id: Venue; label: string }[] = [
  { id: 'gym', label: '健身房' },
  { id: 'home', label: '居家' },
  { id: 'outdoor', label: '户外' },
  { id: 'bodyweight', label: '纯自重' },
];

/** 场地筛选：venues 缺失的老数据视为全部场地可见 */
export function matchesVenueFilter(ex: Exercise, filter: VenueFilter): boolean {
  if (filter === 'all') return true;
  if (!ex.venues || ex.venues.length === 0) return true;
  return ex.venues.includes(filter);
}

/** 门槛从低到高：纯自重（哪儿都能练）> 居家 > 户外 > 健身房 */
const ACCESS_ORDER: Venue[] = ['bodyweight', 'home', 'outdoor', 'gym'];

/**
 * 行内只展示一个场地标签：取门槛最低的那个（纯自重动作显示「自重」，
 * 居家能做的哑铃动作显示「居家」，只有健身房能做的显示「健身房」）。
 * venues 缺失返回 null（不显示标签）。
 */
export function primaryVenue(ex: Exercise): Venue | null {
  if (!ex.venues || ex.venues.length === 0) return null;
  const venues = ex.venues;
  return ACCESS_ORDER.find((v) => venues.includes(v)) ?? null;
}
