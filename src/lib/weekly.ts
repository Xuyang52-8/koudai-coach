/**
 * 每周总结（v1.6）：汇总最近 7 天的训练次数 / 总消耗 / 体重变化。
 * 产物是一句话文案，喂给周一 09:00 的本地通知（syncWeeklySummary）和成长页「上周战报」卡。
 */
import { getCardioEntries, getCycle, readWeightLog, shiftDate, todayStr } from './store';

export interface WeeklyStats {
  /** 力量训练次数（近 7 天，不含 REST） */
  sessions: number;
  /** 力量 + 有氧 + 小练合计大卡（近 7 天） */
  kcal: number;
  /** 体重变化 kg（最早一次 − 最近一次，负=变轻）；不足两次记录为 null */
  weightDelta: number | null;
  /** 最新体重（无记录为 null） */
  latestWeight: number | null;
}

export function computeWeeklyStats(): WeeklyStats {
  const today = todayStr();
  const cycle = getCycle();
  let sessions = 0;
  let kcal = 0;
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(today, -i);
    const dayHist = cycle.history.filter((h) => h.date === date && h.workoutId !== 'REST');
    sessions += dayHist.length;
    kcal += dayHist.reduce((s, h) => s + h.kcal, 0);
    kcal += getCardioEntries(date).reduce((s, c) => s + c.kcal, 0);
  }
  const log = readWeightLog();
  const entries = Object.entries(log).sort(([a], [b]) => (a < b ? -1 : 1));
  const latestWeight = entries.length > 0 ? entries[entries.length - 1][1] : null;
  let weightDelta: number | null = null;
  if (entries.length >= 2) {
    /* 近 7 天内的最早一次 vs 最新一次；7 天内只有 1 次就用全部记录里它前一个 */
    const inWeek = entries.filter(([d]) => d >= shiftDate(today, -6));
    const first = inWeek.length >= 2 ? inWeek[0] : entries[entries.length - 2];
    weightDelta = Math.round((entries[entries.length - 1][1] - first[1]) * 10) / 10;
  }
  return { sessions, kcal: Math.round(kcal), weightDelta, latestWeight };
}

/** 战报文案（通知 + 卡片共用） */
export function weeklySummaryText(stats: WeeklyStats = computeWeeklyStats()): string {
  const parts: string[] = [];
  parts.push(stats.sessions > 0 ? `练了 ${stats.sessions} 次` : '一次没练，这周补回来');
  if (stats.kcal > 0) parts.push(`运动消耗 ${stats.kcal} 大卡`);
  if (stats.weightDelta !== null) {
    const d = stats.weightDelta;
    parts.push(d < 0 ? `体重 ${d}kg，在瘦` : d === 0 ? '体重持平' : `体重 +${d}kg，注意热量`);
  }
  return parts.join('，') + '。';
}
