/**
 * 《口袋私教》localStorage 数据层
 * 键空间 koudai-coach:* · React hooks 风格 · useSyncExternalStore 驱动
 *
 * 用法（页面代理直接消费）：
 *   const [cycle] = useCycle();
 *   completeWorkout('A', 320);
 *   const [settings, setSettings] = useSettings();
 *   updateSettings({ ttsOn: false });
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type {
  AppSettings,
  WeightLog,
  ChecklistState,
  ComputedTargets,
  CycleState,
  DietEntry,
  Exercise,
  ScheduleConfig,
  SupplementState,
  UserProfile,
  Venue,
  WorkoutSession,
} from './types';
import programJson from '../data/program.json';
import nutritionJson from '../data/nutrition.json';
import { computeTargets } from './profile';
import { applyRpe } from './adjust';
import type { ExerciseOverride, RpeChoice } from './adjust';

/* ================= 底层 KV 引擎 ================= */

const PREFIX = 'koudai-coach:';

type Listener = () => void;
const listenerMap = new Map<string, Set<Listener>>();
/** 已解析值的缓存，保证 getSnapshot 返回稳定引用 */
const valueCache = new Map<string, unknown>();

function fullKey(name: string): string {
  return PREFIX + name;
}

export function readKey<T>(name: string, fallback: T): T {
  if (valueCache.has(name)) return valueCache.get(name) as T;
  let value = fallback;
  try {
    const raw = localStorage.getItem(fullKey(name));
    if (raw != null) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  valueCache.set(name, value);
  return value;
}

export function writeKey<T>(name: string, value: T): void {
  valueCache.set(name, value);
  try {
    localStorage.setItem(fullKey(name), JSON.stringify(value));
  } catch {
    // 存储满/隐私模式：静默失败，内存态仍可用
  }
  const set = listenerMap.get(name);
  if (set) set.forEach((fn) => fn());
}

function subscribeKey(name: string, listener: Listener): () => void {
  let set = listenerMap.get(name);
  if (!set) {
    set = new Set();
    listenerMap.set(name, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

// 跨标签页同步
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    const name = e.key.slice(PREFIX.length);
    valueCache.delete(name);
    const set = listenerMap.get(name);
    if (set) set.forEach((fn) => fn());
  });
}

/**
 * 通用响应式 KV hook。
 * @param name 不带前缀的键名，如 'settings'、'diet:2025-01-15'
 */
export function useStoreKey<T>(name: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback((fn: Listener) => subscribeKey(name, fn), [name]);
  const getSnapshot = useCallback(() => readKey(name, fallback), [name, fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot);
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readKey(name, fallback);
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeKey(name, resolved);
    },
    [name, fallback],
  );
  return [value, setValue];
}

/* ================= 日期工具 ================= */

/** 本地日期 YYYY-MM-DD */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日期平移：shiftDate('2025-01-15', -1) => '2025-01-14' */
export function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return todayStr(d);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/* ================= 键名常量 ================= */

export const KEYS = {
  cycle: 'cycle',
  settings: 'settings',
  customExercises: 'customExercises',
  session: 'session',
  profile: 'profile',
  schedule: 'schedule',
  dietKey: (date: string) => `diet:${date}`,
  supplementsKey: (date: string) => `supplements:${date}`,
  checklistKey: (date: string) => `checklist:${date}`,
  venueTodayKey: (date: string) => `venueToday:${date}`,
  minisKey: (date: string) => `minis:${date}`,
  exerciseOverrideKey: (exerciseId: string) => `exoverride:${exerciseId}`,
  /** 双向调节（降阶/进阶）用户选择：原动作 id → 现动作 id */
  ladder: 'ladder',
  /** 日期排期覆盖：YYYY-MM-DD → 'train' | 'rest'（自由排） */
  dayPlan: 'dayPlan',
  /** 有氧/跑步打卡：cardio:{date} → CardioEntry[] */
  cardioKey: (date: string) => `cardio:${date}`,
  /** 体重打卡：YYYY-MM-DD → kg */
  weightLog: 'weightLog',
} as const;

/* ================= cycle：练一休一循环 ================= */

export const DEFAULT_CYCLE: CycleState = {
  nextWorkoutIndex: 0,
  streak: 0,
  lastTrainingDate: null,
  lastRestDate: null,
  history: [],
};

export function getCycle(): CycleState {
  return readKey(KEYS.cycle, DEFAULT_CYCLE);
}

export function useCycle(): [CycleState, (next: CycleState | ((p: CycleState) => CycleState)) => void] {
  return useStoreKey(KEYS.cycle, DEFAULT_CYCLE);
}

/** 某日期是否有小练完成记录（koudai-coach:minis:{date} 非空）。小练与休息日恢复打卡同等地位 */
function hasMiniOn(date: string): boolean {
  return readKey<string[]>(KEYS.minisKey(date), EMPTY_MINIS).length > 0;
}

/** 打卡后的新 streak：同一天不重复累计；昨天有记录则 +1；否则重新计 1。小练完成记录同等计入 */
function nextStreak(cycle: CycleState, today: string): number {
  const dates = new Set(cycle.history.map((h) => h.date));
  if (dates.has(today) || hasMiniOn(today)) return cycle.streak;
  const yesterday = shiftDate(today, -1);
  if (dates.has(yesterday) || hasMiniOn(yesterday)) return cycle.streak + 1;
  return 1;
}

/**
 * 完成一节课。推进循环到下节课、写 history、续 streak。
 * @returns 更新后的 CycleState
 */
export function completeWorkout(workoutId: string, kcal: number): CycleState {
  const today = todayStr();
  const cycle = getCycle();
  const idx = programJson.workouts.findIndex((w) => w.id === workoutId);
  const advanceFrom = idx >= 0 ? idx : cycle.nextWorkoutIndex;
  const alreadyCounted = cycle.history.some((h) => h.date === today && h.workoutId === workoutId);
  const next: CycleState = {
    nextWorkoutIndex: (advanceFrom + 1) % programJson.workouts.length,
    streak: nextStreak(cycle, today),
    lastTrainingDate: today,
    lastRestDate: cycle.lastRestDate,
    history: alreadyCounted
      ? cycle.history
      : [...cycle.history, { date: today, workoutId, kcal }],
  };
  writeKey(KEYS.cycle, next);
  return next;
}

/**
 * 休息日完成一项恢复活动打卡。不推进课程序号，只续 streak + 记录。
 */
export function completeRestDay(kcal = 0): CycleState {
  const today = todayStr();
  const cycle = getCycle();
  const alreadyCounted = cycle.history.some((h) => h.date === today && h.workoutId === 'REST');
  const next: CycleState = {
    nextWorkoutIndex: cycle.nextWorkoutIndex,
    streak: nextStreak(cycle, today),
    lastTrainingDate: cycle.lastTrainingDate,
    lastRestDate: today,
    history: alreadyCounted ? cycle.history : [...cycle.history, { date: today, workoutId: 'REST', kcal }],
  };
  writeKey(KEYS.cycle, next);
  return next;
}

/** 近 N 天打卡情况（streak 日历用），从旧到新排列。小练完成日无训练记录时按恢复打卡（rest）呈现 */
export function getRecentCheckins(days: number): { date: string; checked: boolean; kind: 'workout' | 'rest' | null }[] {
  const cycle = getCycle();
  const map = new Map<string, 'workout' | 'rest'>();
  for (const h of cycle.history) map.set(h.date, h.workoutId === 'REST' ? 'rest' : 'workout');
  const today = todayStr();
  const out: { date: string; checked: boolean; kind: 'workout' | 'rest' | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const kind = map.get(date) ?? (hasMiniOn(date) ? 'rest' : null);
    out.push({ date, checked: kind !== null, kind });
  }
  return out;
}

/* ================= diet：饮食记录（按天存储） ================= */

const EMPTY_DIET: DietEntry[] = [];

export function getDietEntries(date: string = todayStr()): DietEntry[] {
  return readKey(KEYS.dietKey(date), EMPTY_DIET);
}

export function useDietEntries(
  date: string = todayStr(),
): [DietEntry[], (next: DietEntry[] | ((p: DietEntry[]) => DietEntry[])) => void] {
  return useStoreKey(KEYS.dietKey(date), EMPTY_DIET);
}

export function addDietEntry(entry: Omit<DietEntry, 'id'> & { id?: string }, date: string = todayStr()): DietEntry {
  const list = getDietEntries(date);
  const full: DietEntry = { ...entry, id: entry.id ?? newId() };
  writeKey(KEYS.dietKey(date), [...list, full]);
  return full;
}

export function removeDietEntry(id: string, date: string = todayStr()): void {
  writeKey(
    KEYS.dietKey(date),
    getDietEntries(date).filter((e) => e.id !== id),
  );
}

/* ================= supplements：补剂打卡（按天存储） ================= */

export const DEFAULT_SUPPLEMENTS: SupplementState = { whey: false, creatine: false };

export function getSupplements(date: string = todayStr()): SupplementState {
  return readKey(KEYS.supplementsKey(date), DEFAULT_SUPPLEMENTS);
}

export function useSupplements(
  date: string = todayStr(),
): [SupplementState, (next: SupplementState | ((p: SupplementState) => SupplementState)) => void] {
  return useStoreKey(KEYS.supplementsKey(date), DEFAULT_SUPPLEMENTS);
}

/** 切换某个补剂当天打卡状态，返回切换后的值 */
export function toggleSupplement(id: 'whey' | 'creatine', date: string = todayStr()): boolean {
  const cur = getSupplements(date);
  const next = { ...cur, [id]: !cur[id] };
  writeKey(KEYS.supplementsKey(date), next);
  return next[id];
}

/* ================= settings ================= */

export const DEFAULT_SETTINGS: AppSettings = {
  deepseekKey: '',
  visionEndpoint: '',
  visionKey: '',
  visionModel: '',
  ttsOn: true,
  ttsCountdownOn: true,
  ttsAuto: true,
  keepScreenOn: true,
  bgAudioKeepAlive: true,
  // 训练提醒：仅安卓 App 生效，网页端只存配置不弹通知
  notifyOn: false,
  notifyTime: '18:00',
  weightKg: 81.5,
  // 外观主题：默认黑夜，老用户无感；设置页「外观」可切白天
  theme: 'dark',
  // 预留字段：账号/密钥体系（当前代码不读不写，仅占位）
  userId: '',
  licenseKey: '',
};

export function getSettings(): AppSettings {
  return readKey(KEYS.settings, DEFAULT_SETTINGS);
}

export function useSettings(): [AppSettings, (next: AppSettings | ((p: AppSettings) => AppSettings)) => void] {
  return useStoreKey(KEYS.settings, DEFAULT_SETTINGS);
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...partial };
  writeKey(KEYS.settings, next);
  return next;
}

/* ================= customExercises：用户自建动作 ================= */

const EMPTY_CUSTOM: Exercise[] = [];

export function getCustomExercises(): Exercise[] {
  return readKey(KEYS.customExercises, EMPTY_CUSTOM);
}

export function useCustomExercises(): [Exercise[], (next: Exercise[] | ((p: Exercise[]) => Exercise[])) => void] {
  return useStoreKey(KEYS.customExercises, EMPTY_CUSTOM);
}

export function addCustomExercise(ex: Omit<Exercise, 'id'> & { id?: string }): Exercise {
  const full: Exercise = { ...ex, id: ex.id ?? `custom-${newId()}` };
  writeKey(KEYS.customExercises, [...getCustomExercises(), full]);
  return full;
}

export function removeCustomExercise(id: string): void {
  writeKey(
    KEYS.customExercises,
    getCustomExercises().filter((e) => e.id !== id),
  );
}

/* ================= session：进行中的训练（锁屏恢复） ================= */

export function getSession(): WorkoutSession | null {
  return readKey<WorkoutSession | null>(KEYS.session, null);
}

export function useSession(): [
  WorkoutSession | null,
  (next: WorkoutSession | null | ((p: WorkoutSession | null) => WorkoutSession | null)) => void,
] {
  return useStoreKey<WorkoutSession | null>(KEYS.session, null);
}

export function startSession(workoutId: string): WorkoutSession {
  const session: WorkoutSession = {
    workoutId,
    exerciseIndex: 0,
    setIndex: 0,
    side: null,
    startedAt: Date.now(),
  };
  writeKey(KEYS.session, session);
  return session;
}

export function updateSession(partial: Partial<WorkoutSession>): WorkoutSession | null {
  const cur = getSession();
  if (!cur) return null;
  const next = { ...cur, ...partial };
  writeKey(KEYS.session, next);
  return next;
}

export function clearSession(): void {
  writeKey<WorkoutSession | null>(KEYS.session, null);
}

/* ================= checklist：首页出门前自检（按天存储，天然每日重置） ================= */

const EMPTY_CHECKLIST: ChecklistState = {};

export function getChecklist(date: string = todayStr()): ChecklistState {
  return readKey(KEYS.checklistKey(date), EMPTY_CHECKLIST);
}

export function useChecklist(
  date: string = todayStr(),
): [ChecklistState, (next: ChecklistState | ((p: ChecklistState) => ChecklistState)) => void] {
  return useStoreKey(KEYS.checklistKey(date), EMPTY_CHECKLIST);
}

/** 切换 checklist 某项，返回切换后的值 */
export function toggleChecklistItem(key: string, date: string = todayStr()): boolean {
  const cur = getChecklist(date);
  const next = { ...cur, [key]: !cur[key] };
  writeKey(KEYS.checklistKey(date), next);
  return next[key];
}

/* ================= venueToday：今日场地覆盖（按天存储，明天自动回档案默认） ================= */

/** 今天的场地覆盖：null = 跟档案（默认）。键按日期存，天然每天重置，不改档案 */
export function getTodayVenue(date: string = todayStr()): Venue | null {
  return readKey<Venue | null>(KEYS.venueTodayKey(date), null);
}

export function useTodayVenue(
  date: string = todayStr(),
): [Venue | null, (next: Venue | null | ((p: Venue | null) => Venue | null)) => void] {
  return useStoreKey<Venue | null>(KEYS.venueTodayKey(date), null);
}

/* ================= minis：日常小练完成记录（按天存储，存完成包 id 列表） ================= */

const EMPTY_MINIS: string[] = [];

/** 某天完成的小练包 id 列表 */
export function getMinisCompleted(date: string = todayStr()): string[] {
  return readKey(KEYS.minisKey(date), EMPTY_MINIS);
}

export function useMinisCompleted(
  date: string = todayStr(),
): [string[], (next: string[] | ((p: string[]) => string[])) => void] {
  return useStoreKey(KEYS.minisKey(date), EMPTY_MINIS);
}

/**
 * 完成一个小练包：记入 minis:{today}（同包同日不重复），并续 streak。
 * 与休息日主动恢复打卡同等地位：不推进课程序号、不写 history、不动 lastTraining/RestDate——
 * 主课表逻辑零影响，只通过 nextStreak 的小练判定把今天算作"练过"。
 * @returns 更新后的 CycleState
 */
export function completeMini(packId: string): CycleState {
  const today = todayStr();
  const cycle = getCycle();
  const list = getMinisCompleted(today);
  // 顺序关键：先用旧 minis 列表 + history 判定"今天是否已算过"，再写 minis 键
  const countedToday = cycle.history.some((h) => h.date === today) || list.length > 0;
  const streak = countedToday ? cycle.streak : nextStreak(cycle, today);
  if (!list.includes(packId)) writeKey(KEYS.minisKey(today), [...list, packId]);
  if (streak === cycle.streak) return cycle;
  const next: CycleState = { ...cycle, streak };
  writeKey(KEYS.cycle, next);
  return next;
}

/* ================= profile：用户身体档案（Onboarding 写入，null = 未填过问卷） ================= */

export function getProfile(): UserProfile | null {
  return readKey<UserProfile | null>(KEYS.profile, null);
}

export function useProfile(): [
  UserProfile | null,
  (next: UserProfile | null | ((p: UserProfile | null) => UserProfile | null)) => void,
] {
  return useStoreKey<UserProfile | null>(KEYS.profile, null);
}

/**
 * 我的器械（存 profile.ownedEquipment）默认值：undefined = 没设置过，解析引擎按"全都有"不过滤。
 * 老用户数据里本就没有这个字段——这里只原样读取、绝不补写，行为与升级前完全一致。
 */
export function getOwnedEquipment(): string[] | undefined {
  return getProfile()?.ownedEquipment;
}

/* ================= schedule：排期配置（默认练一休一） ================= */

export const DEFAULT_SCHEDULE: ScheduleConfig = { mode: '1on1off', weekdays: [1, 3, 5] };

export function getSchedule(): ScheduleConfig {
  return readKey(KEYS.schedule, DEFAULT_SCHEDULE);
}

export function useSchedule(): [
  ScheduleConfig,
  (next: ScheduleConfig | ((p: ScheduleConfig) => ScheduleConfig)) => void,
] {
  return useStoreKey(KEYS.schedule, DEFAULT_SCHEDULE);
}

/* ================= exoverride：RPE 自适应强度覆盖（按动作存储） ================= */

/** 读取某动作的覆盖记录（无 = null）。规则计算见 lib/adjust.ts */
export function getExerciseOverride(exerciseId: string): ExerciseOverride | null {
  return readKey<ExerciseOverride | null>(KEYS.exerciseOverrideKey(exerciseId), null);
}

export function useExerciseOverride(
  exerciseId: string | null | undefined,
): [ExerciseOverride | null, (next: ExerciseOverride | null | ((p: ExerciseOverride | null) => ExerciseOverride | null)) => void] {
  return useStoreKey<ExerciseOverride | null>(KEYS.exerciseOverrideKey(exerciseId ?? '__none__'), null);
}

/** 写入一次 RPE 评价，返回新的覆盖记录（规则：lib/adjust.ts applyRpe） */
export function applyRpeOverride(ex: Exercise, rpe: RpeChoice): ExerciseOverride {
  const next = applyRpe(getExerciseOverride(ex.id), ex, rpe);
  writeKey(KEYS.exerciseOverrideKey(ex.id), next);
  return next;
}

/** 重置某动作的覆盖记录（设置页「重置」按钮）：清键 + 通知订阅者 */
export function resetExerciseOverride(exerciseId: string): void {
  writeKey<ExerciseOverride | null>(KEYS.exerciseOverrideKey(exerciseId), null);
  try {
    localStorage.removeItem(fullKey(KEYS.exerciseOverrideKey(exerciseId)));
  } catch {
    // 隐私模式等：内存态已清，忽略
  }
}

/** 全部覆盖记录（设置页列表用），按最近更新排序 */
export function getAllExerciseOverrides(): { exerciseId: string; override: ExerciseOverride }[] {
  const prefix = fullKey('exoverride:');
  const out: { exerciseId: string; override: ExerciseOverride }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const exerciseId = k.slice(prefix.length);
      if (!exerciseId) continue;
      const override = getExerciseOverride(exerciseId);
      if (override) out.push({ exerciseId, override });
    }
  } catch {
    // localStorage 不可用：返回已收集部分
  }
  out.sort((a, b) => b.override.updatedAt - a.override.updatedAt);
  return out;
}

/* ================= ladder：双向调节（做不了降阶 / 太轻松进阶，跨课记住） ================= */

export type LadderOverrides = Record<string, string>;

export function getLadderOverrides(): LadderOverrides {
  return readKey<LadderOverrides>(KEYS.ladder, {});
}

export function useLadderOverrides(): [
  LadderOverrides,
  (next: LadderOverrides | ((p: LadderOverrides) => LadderOverrides)) => void,
] {
  return useStoreKey<LadderOverrides>(KEYS.ladder, {});
}

/**
 * 记录一次调节：fromId 动作被换成 toId。
 * 同时清掉所有"曾经指向 fromId"的旧记录（避免 A→B 和 B→A 互相打架）。
 * toId 传 null 表示清除 fromId 的调节记录。
 */
export function setLadderChoice(fromId: string, toId: string | null): void {
  const cur = { ...getLadderOverrides() };
  for (const [k, v] of Object.entries(cur)) {
    if (v === fromId) delete cur[k];
  }
  if (toId === null || toId === fromId) delete cur[fromId];
  else cur[fromId] = toId;
  writeKey(KEYS.ladder, cur);
}

/* ================= dayPlan：日期排期覆盖（自由排：临时加练/休息） ================= */

export type DayPlanOverride = 'train' | 'rest';
export type DayPlanMap = Record<string, DayPlanOverride>;

export function getDayPlan(): DayPlanMap {
  return readKey<DayPlanMap>(KEYS.dayPlan, {});
}

export function useDayPlan(): [DayPlanMap, (next: DayPlanMap | ((p: DayPlanMap) => DayPlanMap)) => void] {
  return useStoreKey<DayPlanMap>(KEYS.dayPlan, {});
}

/** 覆盖某天的排期；null 清除覆盖（恢复默认节奏） */
export function setDayPlan(date: string, override: DayPlanOverride | null): void {
  const cur = { ...getDayPlan() };
  if (override === null) delete cur[date];
  else cur[date] = override;
  writeKey(KEYS.dayPlan, cur);
}

/* ================= cardio：有氧/跑步打卡（按天存储） ================= */

export interface CardioEntry {
  id: string;
  /** 如 "跑步 3.2km" "小米健康同步" */
  label: string;
  minutes: number;
  kcal: number;
  /** 距离 km（跑步类有，缺省 0） */
  distanceKm?: number;
  source: 'health-connect' | 'ai' | 'manual';
}

const EMPTY_CARDIO: CardioEntry[] = [];

export function getCardioEntries(date: string = todayStr()): CardioEntry[] {
  return readKey(KEYS.cardioKey(date), EMPTY_CARDIO);
}

export function useCardioEntries(
  date: string = todayStr(),
): [CardioEntry[], (next: CardioEntry[] | ((p: CardioEntry[]) => CardioEntry[])) => void] {
  return useStoreKey(KEYS.cardioKey(date), EMPTY_CARDIO);
}

export function addCardioEntry(entry: Omit<CardioEntry, 'id'> & { id?: string }, date: string = todayStr()): CardioEntry {
  const list = getCardioEntries(date);
  const full: CardioEntry = { ...entry, id: entry.id ?? newId() };
  writeKey(KEYS.cardioKey(date), [...list, full]);
  return full;
}

export function removeCardioEntry(id: string, date: string = todayStr()): void {
  writeKey(
    KEYS.cardioKey(date),
    getCardioEntries(date).filter((e) => e.id !== id),
  );
}

/* ================= targets：动态营养目标 ================= */

/** 老用户兜底：nutrition.json 里的静态档案（与 ComputedTargets 同形） */
const STATIC_TARGETS: ComputedTargets = {
  bmr: nutritionJson.profile.bmr,
  tdee: nutritionJson.profile.tdee,
  targetKcal: nutritionJson.profile.targetKcal,
  proteinG: nutritionJson.profile.proteinG,
  fatG: nutritionJson.profile.fatG,
  carbsG: nutritionJson.profile.carbsG,
};

/** 今日营养目标：有 profile 按 Mifflin 动态算，没有回落 nutrition.json 静态值（兼容老用户） */
export function useWeightLog(): [WeightLog, (next: WeightLog | ((p: WeightLog) => WeightLog)) => void] {
  return useStoreKey<WeightLog>(KEYS.weightLog, {});
}

/** 非组件环境读体重记录（weekly.ts 等） */
export function readWeightLog(): WeightLog {
  return readKey<WeightLog>(KEYS.weightLog, {});
}

export function useTargets(): ComputedTargets {
  const [profile] = useProfile();
  return useMemo(() => (profile ? computeTargets(profile) : STATIC_TARGETS), [profile]);
}
