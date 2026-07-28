/**
 * 桌面小组件数据桥（v1.7）：把今日关键数据写成 JSON 存进 Preferences，
 * 原生 KoudaiWidgetProvider 读取渲染。仅原生壳有效，网页端 no-op。
 */
import { KEYS, getCardioEntries, getCycle, readKey, todayStr } from './store';
import type { AppSettings, DietEntry, TodayState } from './types';

interface WidgetData {
  deficit: number | null;
  burn: number;
  intake: number;
  status: string;
  streak: number;
  theme: string;
}

function isNative(): boolean {
  return typeof window !== 'undefined'
    && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

/** 计算并推送今日数据到桌面小组件 */
export async function syncWidgetData(state?: TodayState | null): Promise<void> {
  if (!isNative()) return;
  try {
    const today = todayStr();
    const cycle = getCycle();
    const settings = readKey<AppSettings | Record<string, never>>(KEYS.settings, {});
    const dietEntries = readKey<DietEntry[]>(`diet:${today}`, []);
    const workoutKcal = cycle.history.filter((h) => h.date === today).reduce((s, h) => s + h.kcal, 0);
    const cardioKcal = getCardioEntries(today).reduce((s, c) => s + c.kcal, 0);
    const minisDone = readKey<string[]>(KEYS.minisKey(today), []);
    const minisKcal = Math.round(minisDone.length * 8 * 5);
    /* 与首页 BurnCard 同口径：日常底盘 BMR×1.25 + 运动 */
    const { computeTargets } = await import('./profile');
    const { getProfile } = await import('./store');
    const profile = getProfile();
    if (!profile) return; // 还没建档就不推，等建档后 Home 会再触发
    const t = computeTargets(profile);
    const burn = Math.round(t.bmr * 1.25) + workoutKcal + cardioKcal + minisKcal;
    const intake = dietEntries.reduce((s, e) => s + e.kcal, 0);
    const deficit = intake > 0 ? burn - intake : null;

    let status = '今天休息，好好恢复';
    if (state?.type === 'workout') {
      status = state.doneToday
        ? `已打卡：${state.workout.subtitle.replace(/\+/g, '·')}`
        : `今天练：${state.workout.subtitle.replace(/\+/g, '·')}`;
    }

    const data: WidgetData = {
      deficit,
      burn,
      intake,
      status,
      streak: cycle.streak,
      theme: ('theme' in settings ? settings.theme : undefined) ?? 'dark',
    };
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: 'widgetData', value: JSON.stringify(data) });
  } catch (e) {
    console.warn('[widget] sync failed:', e);
  }
}
