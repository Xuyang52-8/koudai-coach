/**
 * 「成长」页数据聚合层 —— 纯函数（无 React / 无 localStorage，冒烟可测）。
 *
 * 从 store 已有键聚合三块数据（页面负责读 store 传进来，本层不碰存储）：
 *   1. 训练日历：cycle.history（训练课 / REST 休息打卡）+ minis:{date}（小练包）→ 月历格子
 *   2. 力量成长线：exoverride:{exerciseId} 的 RPE history 逐条回放（applyRpe 复算每次
 *      评价后生效的重量/次数）+ weights 键（用户手动步进的当前重量）
 *   3. 里程碑：课数（1/5/10/25）· 连续打卡（7/30/100）· 首次小练 · 首次连续 3 次加重
 */
import programJson from '../data/program.json';
import minisJson from '../data/minis.json';
import { applyRpe, shiftReps } from './adjust';
import type { ExerciseOverride, RpeChoice } from './adjust';
import { clampWeight, formatKg } from '../components/workout/weight';
import { estimateWorkoutMinutes } from './utils-workout';
import type { CycleState, Exercise, HistoryEntry, MiniPack, Program } from './types';

const program = programJson as Program;
const MINI_PACKS = minisJson as MiniPack[];

/* ================= 日期小工具（纯函数，与 store 口径一致：本地 YYYY-MM-DD） ================= */

function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 日期平移：shiftDay('2025-01-15', -1) => '2025-01-14' */
export function shiftDay(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return toDateStr(d);
}

/** 月份平移：shiftMonth(2025, 1, -1) => { year: 2024, month: 12 } */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

/* ================= 1. 训练日历 ================= */

/** workout=训练课（薄荷绿）· mini=小练日（黄）· rest=休息恢复打卡（灰） */
export type DayKind = 'workout' | 'mini' | 'rest';

export interface DayWorkoutLine {
  workoutId: string;
  /** 第几课（program.workouts 下标 +1），找不到为 0 */
  lessonNumber: number;
  title: string;
  subtitle: string;
  kcal: number;
  /** 估算分钟数（口径同 estimateWorkoutMinutes） */
  minutes: number;
}

export interface DayDetail {
  date: string;
  kind: DayKind;
  workouts: DayWorkoutLine[];
  /** 休息恢复打卡的消耗（无 REST 记录为 null） */
  restKcal: number | null;
  /** 当天完成的小练包名 */
  minis: string[];
  kcalTotal: number;
}

export interface CalendarInput {
  history: HistoryEntry[];
  /** 日期 → 当天完成的小练包 id 列表（页面扫 minis:* 键收集） */
  minisByDate: Record<string, string[]>;
}

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  kind: DayKind | null;
}

export interface MonthCalendar {
  year: number;
  /** 1-12 */
  month: number;
  /** "2025 年 1 月" */
  label: string;
  /** 42 格（6 周 × 7），周一开头 */
  cells: CalendarCell[];
  workoutDays: number;
  miniDays: number;
  restDays: number;
}

/** 小练包 id → 展示名（未知 id 原样返回兜底） */
export function miniName(id: string): string {
  return MINI_PACKS.find((p) => p.id === id)?.name ?? id;
}

/** 某天的点色类型：训练 > 小练 > 休息打卡；什么都没 → null */
export function dayKind(date: string, input: CalendarInput): DayKind | null {
  let workout = false;
  let rest = false;
  for (const h of input.history) {
    if (h.date !== date) continue;
    if (h.workoutId === 'REST') rest = true;
    else workout = true;
  }
  if (workout) return 'workout';
  if ((input.minisByDate[date] ?? []).length > 0) return 'mini';
  if (rest) return 'rest';
  return null;
}

/** 当天摘要（点格子弹层用）：练了哪课 / 估算时长 / 消耗 / 休息打卡 / 小练包。无记录返回 null */
export function buildDayDetail(date: string, input: CalendarInput): DayDetail | null {
  const kind = dayKind(date, input);
  if (kind === null) return null;
  const workouts: DayWorkoutLine[] = [];
  let restKcal: number | null = null;
  for (const h of input.history) {
    if (h.date !== date) continue;
    if (h.workoutId === 'REST') {
      restKcal = (restKcal ?? 0) + h.kcal;
      continue;
    }
    const idx = program.workouts.findIndex((w) => w.id === h.workoutId);
    const w = idx >= 0 ? program.workouts[idx] : null;
    workouts.push({
      workoutId: h.workoutId,
      lessonNumber: idx + 1,
      title: w?.title ?? h.workoutId,
      subtitle: w?.subtitle ?? '',
      kcal: h.kcal,
      minutes: w ? estimateWorkoutMinutes(w) : 0,
    });
  }
  const minis = (input.minisByDate[date] ?? []).map(miniName);
  const kcalTotal = workouts.reduce((s, x) => s + x.kcal, 0) + (restKcal ?? 0);
  return { date, kind, workouts, restKcal, minis, kcalTotal };
}

/**
 * 月历：42 格周一开头，前后补邻月日期（inMonth=false 置灰）。
 * @param month 1-12；today 本地日期 YYYY-MM-DD
 */
export function buildMonthCalendar(year: number, month: number, input: CalendarInput, today: string): MonthCalendar {
  const first = new Date(year, month - 1, 1);
  // 周一开头：getDay() 0=周日 → 偏移 6；1=周一 → 偏移 0
  const offset = (first.getDay() + 6) % 7;
  const gridStart = shiftDay(toDateStr(first), -offset);
  const cells: CalendarCell[] = [];
  let workoutDays = 0;
  let miniDays = 0;
  let restDays = 0;
  for (let i = 0; i < 42; i++) {
    const date = shiftDay(gridStart, i);
    const inMonth = date.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}`;
    const kind = inMonth ? dayKind(date, input) : null;
    if (inMonth) {
      if (kind === 'workout') workoutDays += 1;
      else if (kind === 'mini') miniDays += 1;
      else if (kind === 'rest') restDays += 1;
    }
    cells.push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth,
      isToday: date === today,
      isFuture: date > today,
      kind,
    });
  }
  return {
    year,
    month,
    label: `${year} 年 ${month} 月`,
    cells,
    workoutDays,
    miniDays,
    restDays,
  };
}

/* ================= 2. 力量成长线 ================= */

export interface StrengthRecord {
  date: string;
  rpe: RpeChoice;
  /** 该次评价后生效的重量（自重类 null） */
  kg: number | null;
  /** 该次评价后生效的次数文案（已应用 repsDelta 平移） */
  reps: string;
  /** 相对上一条记录的调整量（负重类 kg / 自重类次数；首条相对基准 0） */
  delta: number;
}

export type StrengthTrend = 'up' | 'flat' | 'down';

export interface StrengthCardData {
  exerciseId: string;
  name: string;
  /** 是否负重类（自重类点评文案用"加量"） */
  weighted: boolean;
  /** 最近记录，旧→新，最多 5 条 */
  records: StrengthRecord[];
  /** 当前生效量，如 "12.5kg × 10-12" / "自重 × 12-14" */
  currentLabel: string;
  /** 人话点评，如 "连续 3 次加重，稳" */
  verdict: string;
  trend: StrengthTrend;
  /** RPE 评价总次数（0 = 只有手动重量记录） */
  totalCount: number;
}

/** 页面侧收集：一个动作一行。baseKg 用 weightSpec(ex).kg（画像分档后基准，不含 RPE 偏移） */
export interface StrengthSourceEntry {
  exercise: Exercise;
  baseKg: number | null;
  override: ExerciseOverride | null;
  /** weights 键里用户手动步进的当前重量，无记录为 null */
  manualKg: number | null;
}

/**
 * 回放 RPE history：从空白覆盖记录逐条 applyRpe，复算每次评价后生效的重量/次数。
 * （history 只留最近 10 条，更早期的累计偏移不可考——展示最近轨迹足够；
 *   「当前量」始终取真实 override 累计值，不依赖回放。）
 */
function replayRecords(ex: Exercise, baseKg: number | null, override: ExerciseOverride): StrengthRecord[] {
  const weighted = baseKg !== null;
  let prev: ExerciseOverride | null = null;
  let prevDelta = 0;
  const out: StrengthRecord[] = [];
  for (const h of override.history) {
    const now = new Date(h.date + 'T12:00:00').getTime();
    prev = applyRpe(prev, ex, h.rpe, now);
    const cur = weighted ? prev.weightDeltaKg : prev.repsDelta;
    out.push({
      date: h.date,
      rpe: h.rpe,
      kg: baseKg !== null ? clampWeight(baseKg + prev.weightDeltaKg) : null,
      reps: shiftReps(ex.reps, prev.repsDelta),
      delta: Math.round((cur - prevDelta) * 100) / 100,
    });
    prevDelta = cur;
  }
  return out;
}

/** 人话点评：看尾部连续走向。负重类"加重"，自重类"加量" */
function verdictFor(deltas: number[], weighted: boolean): { text: string; trend: StrengthTrend } {
  if (deltas.length === 0) return { text: '', trend: 'flat' };
  const last = deltas[deltas.length - 1];
  if (last < 0) {
    return { text: weighted ? '上次减了重量，恢复中' : '上次减了点量，恢复中', trend: 'down' };
  }
  let ups = 0;
  for (let i = deltas.length - 1; i >= 0 && deltas[i] > 0; i--) ups += 1;
  const verb = weighted ? '加重' : '加量';
  if (ups >= 3) return { text: `连续 ${ups} 次${verb}，稳`, trend: 'up' };
  if (ups === 2) return { text: `连续 2 次${verb}，势头起来了`, trend: 'up' };
  if (ups === 1) return { text: `上次加了点，先稳住它`, trend: 'up' };
  // last === 0：持平
  if (deltas.length === 1) return { text: '第一次记录，基准线在这了', trend: 'flat' };
  return { text: '这周持平，正常', trend: 'flat' };
}

/**
 * 力量卡列表：被 RPE 评过（override.history 非空）或有手动重量记录（weights 键）的动作各一张。
 * 按最近记录日期倒序。
 */
export function buildStrengthCards(entries: StrengthSourceEntry[]): StrengthCardData[] {
  const cards: StrengthCardData[] = [];
  for (const e of entries) {
    const hasRpe = e.override !== null && e.override.history.length > 0;
    if (!hasRpe && e.manualKg === null) continue;
    const weighted = e.baseKg !== null;
    const records = e.override ? replayRecords(e.exercise, e.baseKg, e.override).slice(-5) : [];
    const deltas = records.map((r) => r.delta);
    const curDeltaKg = e.override?.weightDeltaKg ?? 0;
    const curRepsDelta = e.override?.repsDelta ?? 0;
    const reps = shiftReps(e.exercise.reps, curRepsDelta);
    let currentLabel: string;
    if (weighted && e.baseKg !== null) {
      const effKg = e.manualKg ?? clampWeight(e.baseKg + curDeltaKg);
      currentLabel = `${formatKg(effKg)} × ${reps}`;
    } else {
      currentLabel = `自重 × ${reps}`;
    }
    let verdict = verdictFor(deltas, weighted);
    if (!hasRpe) {
      verdict = { text: '重量是你自己调的；练完评一次 RPE，这里开始记趋势', trend: 'flat' };
    }
    cards.push({
      exerciseId: e.exercise.id,
      name: e.exercise.name,
      weighted,
      records,
      currentLabel,
      verdict: verdict.text,
      trend: verdict.trend,
      totalCount: e.override?.history.length ?? 0,
    });
  }
  cards.sort((a, b) => {
    const da = a.records[a.records.length - 1]?.date ?? '';
    const db = b.records[b.records.length - 1]?.date ?? '';
    return db.localeCompare(da);
  });
  return cards;
}

/* ================= 3. 里程碑墙 ================= */

export type MilestoneKind = 'lesson' | 'streak' | 'mini' | 'strength';

export interface MilestoneData {
  id: string;
  kind: MilestoneKind;
  /** 短名，如 "第 10 课" */
  title: string;
  /** 达成条件说明（未达成时展示） */
  desc: string;
  reached: boolean;
  /** 达成日 YYYY-MM-DD（未达成 null） */
  reachedDate: string | null;
  /** 新达成庆祝卡文案 */
  celebrate: string;
  /** 可计数进度（首次类为 null） */
  progress: { current: number; target: number } | null;
}

export interface MilestoneInput {
  history: HistoryEntry[];
  /** 当前连续打卡（cycle.streak） */
  streak: number;
  minisByDate: Record<string, string[]>;
  overrides: { exerciseId: string; override: ExerciseOverride }[];
  /** 今天 YYYY-MM-DD（streak 兜底的达成日） */
  today: string;
}

/** 全部有打卡记录的日期（训练 + 休息 + 小练），去重排序 */
function checkinDates(input: MilestoneInput): string[] {
  const set = new Set<string>();
  for (const h of input.history) set.add(h.date);
  for (const [date, ids] of Object.entries(input.minisByDate)) {
    if (ids.length > 0) set.add(date);
  }
  return [...set].sort();
}

/** 最长连续打卡天数 */
export function longestRun(dates: string[]): number {
  let best = 0;
  let len = 0;
  let prev: string | null = null;
  for (const d of dates) {
    len = prev !== null && shiftDay(prev, 1) === d ? len + 1 : 1;
    if (len > best) best = len;
    prev = d;
  }
  return best;
}

/** 最早达成连续 n 天的日期（该段连续的第 n 天），从未达成 null */
function streakReachedDate(dates: string[], n: number): string | null {
  let runStart: string | null = null;
  let len = 0;
  let prev: string | null = null;
  for (const d of dates) {
    if (prev !== null && shiftDay(prev, 1) === d) len += 1;
    else {
      runStart = d;
      len = 1;
    }
    if (len >= n && runStart !== null) return shiftDay(runStart, n - 1);
    prev = d;
  }
  return null;
}

/** 首次「同一动作连续 3 次太轻松（=连续加重）」的达成日（第 3 次那天），从未 null */
function firstTripleUpDate(overrides: { exerciseId: string; override: ExerciseOverride }[]): string | null {
  let best: string | null = null;
  for (const { override } of overrides) {
    let run = 0;
    for (const h of override.history) {
      run = h.rpe === 'easy' ? run + 1 : 0;
      if (run >= 3) {
        if (best === null || h.date < best) best = h.date;
        break;
      }
    }
  }
  return best;
}

/** 里程碑墙：预设 9 枚，已达成的带达成日点亮 */
export function buildMilestones(input: MilestoneInput): MilestoneData[] {
  const lessonDates = input.history
    .filter((h) => h.workoutId !== 'REST')
    .map((h) => h.date)
    .sort();
  const lessonsDone = lessonDates.length;
  const dates = checkinDates(input);
  const bestRun = Math.max(longestRun(dates), input.streak);
  const miniDates = Object.entries(input.minisByDate)
    .filter(([, ids]) => ids.length > 0)
    .map(([date]) => date)
    .sort();
  const tripleUp = firstTripleUpDate(input.overrides);

  const out: MilestoneData[] = [];

  const lessonSpecs: { n: number; celebrate: string }[] = [
    { n: 1, celebrate: '第 1 课达成，开张了' },
    { n: 5, celebrate: '第 5 课达成，有点样子了' },
    { n: 10, celebrate: '第 10 课达成，你不是新手了' },
    { n: 25, celebrate: '第 25 课达成，训练已经是生活的一部分' },
  ];
  for (const { n, celebrate } of lessonSpecs) {
    const reached = lessonsDone >= n;
    out.push({
      id: `lesson-${n}`,
      kind: 'lesson',
      title: `第 ${n} 课`,
      desc: `累计完成 ${n} 节训练课`,
      reached,
      reachedDate: reached ? lessonDates[n - 1] : null,
      celebrate,
      progress: { current: Math.min(lessonsDone, n), target: n },
    });
  }

  const streakSpecs: { n: number; celebrate: string }[] = [
    { n: 7, celebrate: '连续 7 天，节奏稳住了' },
    { n: 30, celebrate: '连续 30 天，你已经跑赢大多数人' },
    { n: 100, celebrate: '连续 100 天，传奇本人' },
  ];
  for (const { n, celebrate } of streakSpecs) {
    const reachedDate = streakReachedDate(dates, n) ?? (input.streak >= n ? input.today : null);
    out.push({
      id: `streak-${n}`,
      kind: 'streak',
      title: `连续 ${n} 天`,
      desc: `连续打卡 ${n} 天（训练 / 小练 / 恢复都算）`,
      reached: reachedDate !== null,
      reachedDate,
      celebrate,
      progress: { current: Math.min(bestRun, n), target: n },
    });
  }

  out.push({
    id: 'first-mini',
    kind: 'mini',
    title: '第一次小练',
    desc: '完成任意一个日常小练包',
    reached: miniDates.length > 0,
    reachedDate: miniDates[0] ?? null,
    celebrate: '第一次小练完成，碎片时间也算数',
    progress: null,
  });

  out.push({
    id: 'triple-up',
    kind: 'strength',
    title: '三连加重',
    desc: '同一动作连续 3 次喊太轻松，越练越重',
    reached: tripleUp !== null,
    reachedDate: tripleUp,
    celebrate: '连续 3 次加重，力量真的在涨',
    progress: null,
  });

  return out;
}

/** 汇总输入（页面一次组装，三板块共用） */
export interface GrowthData {
  calendar: CalendarInput;
  milestones: MilestoneInput;
}

/** 便捷组装：从 cycle + 扫描结果出 GrowthData */
export function buildGrowthData(
  cycle: CycleState,
  minisByDate: Record<string, string[]>,
  overrides: { exerciseId: string; override: ExerciseOverride }[],
  today: string,
): GrowthData {
  return {
    calendar: { history: cycle.history, minisByDate },
    milestones: { history: cycle.history, streak: cycle.streak, minisByDate, overrides, today },
  };
}
