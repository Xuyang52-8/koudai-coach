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
  ChecklistState,
  ComputedTargets,
  CycleState,
  DietEntry,
  Exercise,
  ScheduleConfig,
  SupplementState,
  UserProfile,
  WorkoutSession,
} from './types';
import programJson from '../data/program.json';
import nutritionJson from '../data/nutrition.json';
import { computeTargets } from './profile';

/* ================= 底层 KV 引擎 ================= */

const PREFIX = 'koudai-coach:';

type Listener = () => void;
const listenerMap = new Map<string, Set<Listener>>();
/** 已解析值的缓存，保证 getSnapshot 返回稳定引用 */
const valueCache = new Map<string, unknown>();

function fullKey(name: string): string {
  return PREFIX + name;
}

function readKey<T>(name: string, fallback: T): T {
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

function writeKey<T>(name: string, value: T): void {
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

/** 打卡后的新 streak：同一天不重复累计；昨天有记录则 +1；否则重新计 1 */
function nextStreak(cycle: CycleState, today: string): number {
  const dates = new Set(cycle.history.map((h) => h.date));
  if (dates.has(today)) return cycle.streak;
  if (dates.has(shiftDate(today, -1))) return cycle.streak + 1;
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

/** 近 N 天打卡情况（streak 日历用），从旧到新排列 */
export function getRecentCheckins(days: number): { date: string; checked: boolean; kind: 'workout' | 'rest' | null }[] {
  const cycle = getCycle();
  const map = new Map<string, 'workout' | 'rest'>();
  for (const h of cycle.history) map.set(h.date, h.workoutId === 'REST' ? 'rest' : 'workout');
  const today = todayStr();
  const out: { date: string; checked: boolean; kind: 'workout' | 'rest' | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const kind = map.get(date) ?? null;
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
  weightKg: 81.5,
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
export function useTargets(): ComputedTargets {
  const [profile] = useProfile();
  return useMemo(() => (profile ? computeTargets(profile) : STATIC_TARGETS), [profile]);
}
