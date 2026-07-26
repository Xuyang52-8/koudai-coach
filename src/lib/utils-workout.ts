/**
 * 训练相关纯函数工具：今日状态推算、消耗估算、动作解析。
 * 练一休一逻辑：只看 history 里"完成事件"，不认日期连续性。
 * 个性化扩展：支持练二休一 / 按固定星期排期，课程按用户场地解析变体动作。
 */
import exercisesJson from '../data/exercises.json';
import programJson from '../data/program.json';
import { applyCapability, getCapability } from './capability';
import { exerciseAvailableWith } from './equipment';
import { bestVenue } from './profile';
import { getCycle, getCustomExercises, getDayPlan, getLadderOverrides, getTodayVenue, shiftDate, todayStr } from './store';
import type {
  CycleState,
  Exercise,
  Program,
  ScheduleConfig,
  TodayState,
  UserProfile,
  Venue,
  Workout,
} from './types';

export const program = programJson as Program;
const builtinExercises = exercisesJson as Exercise[];

/** 4 节课的短名，循环进度圆点用：①拉 ②腿+核心 ③推 ④弱项 */
export const LESSON_SHORT_NAMES = ['拉', '腿+核心', '推', '弱项'];

/** 按 id 查动作：内置库 + 用户自建 */
export function getExerciseById(id: string): Exercise | null {
  const hit = builtinExercises.find((e) => e.id === id) ?? getCustomExercises().find((e) => e.id === id);
  return hit ?? null;
}

/** 全部动作（内置 + 自建），动作库页用 */
export function getAllExercises(): Exercise[] {
  return [...builtinExercises, ...getCustomExercises()];
}

/** 解析一节课：热身 + 正式动作列表 */
export function resolveWorkout(workout: Workout): { warmup: Exercise | null; exercises: Exercise[] } {
  return {
    warmup: getExerciseById(workout.warmupExerciseId),
    exercises: workout.exerciseIds
      .map((id) => getExerciseById(id))
      .filter((e): e is Exercise => e !== null),
  };
}

/* ================= 我的器械过滤层（仅 gym 场地 + profile.ownedEquipment 存在时启用） ================= */

/**
 * 单个动作在 owned 下的可用候选：原动作 → substitutes 有序替代链（替代动作同样验器械）
 * → 再降级本课 home / bodyweight 同位变体。全部不可用返回空数组。
 * 铁律：宁可少排一个动作，绝不推荐用户健身房没有的器械。
 */
function equipmentCandidates(workout: Workout, ex: Exercise, index: number, owned: string[]): Exercise[] {
  const out: Exercise[] = [];
  const push = (c: Exercise | null): void => {
    if (c && !out.some((x) => x.id === c.id)) out.push(c);
  };
  push(ex);
  for (const sid of ex.substitutes ?? []) push(getExerciseById(sid));
  push(getExerciseById(workout.variants?.home?.[index] ?? '__none__'));
  push(getExerciseById(workout.variants?.bodyweight?.[index] ?? '__none__'));
  return out.filter((c) => exerciseAvailableWith(c, owned));
}

/** 正式动作列表过器械：保持位置与数量（某位全不可用才忍痛去掉），并尽量避开已排重复动作 */
function filterExercisesByEquipment(workout: Workout, exercises: Exercise[], owned: string[]): Exercise[] {
  const used = new Set<string>();
  const out: Exercise[] = [];
  exercises.forEach((ex, i) => {
    const candidates = equipmentCandidates(workout, ex, i, owned);
    if (candidates.length === 0) return; // 全不行：放弃这个位置（铁律优先于课表完整）
    const pick = candidates.find((c) => !used.has(c.id)) ?? candidates[0];
    used.add(pick.id);
    out.push(pick);
  });
  return out;
}

/** 热身过器械：原热身 → 替代链 → 热身 home/bodyweight 变体 → null（页面本就有 null 兜底） */
function filterWarmupByEquipment(workout: Workout, warmup: Exercise | null, owned: string[]): Exercise | null {
  if (!warmup) return null;
  if (exerciseAvailableWith(warmup, owned)) return warmup;
  for (const sid of warmup.substitutes ?? []) {
    const sub = getExerciseById(sid);
    if (sub && exerciseAvailableWith(sub, owned)) return sub;
  }
  for (const vid of [workout.warmupVariants?.home, workout.warmupVariants?.bodyweight]) {
    const variant = vid ? getExerciseById(vid) : null;
    if (variant && exerciseAvailableWith(variant, owned)) return variant;
  }
  return null;
}

/**
 * 分场地解析一节课（个性化版）：
 * 场地优先级——今日选择 overrideVenue > 档案 bestVenue > 无（等价 resolveWorkout）。
 * 缺变体或变体全失效时回落 exerciseIds / warmupExerciseId。
 * 器械过滤——场地=gym 且 profile.ownedEquipment 存在时，缺器械动作走替代链（替代也验器械），
 * 全不行降级本课居家/自重变体；ownedEquipment 为 undefined（老用户）时完全不过滤。
 * 返回前过能力引擎：容量随已完成的课数等级增长（Lv.1 原样，level 内部自取当前 cycle）。
 */
export function resolveExercisesForProfile(
  workout: Workout,
  profile: UserProfile | null | undefined,
  overrideVenue?: Venue | null,
): { warmup: Exercise | null; exercises: Exercise[] } {
  const venue = overrideVenue ?? (profile ? bestVenue(profile.venues) : null);
  let warmup: Exercise | null;
  let exercises: Exercise[];
  if (!venue) {
    ({ warmup, exercises } = resolveWorkout(workout));
  } else {
    const ids = workout.variants?.[venue] ?? workout.exerciseIds;
    exercises = ids.map((id) => getExerciseById(id)).filter((e): e is Exercise => e !== null);
    if (exercises.length === 0) {
      // 变体全失效：回落原始课程
      ({ warmup, exercises } = resolveWorkout(workout));
    } else {
      warmup = getExerciseById(workout.warmupVariants?.[venue] ?? workout.warmupExerciseId);
    }
  }
  // 我的器械过滤：仅 gym 场地 + 用户设置过自有器械清单（undefined = 全都有，老用户无感不过滤）
  const owned = profile?.ownedEquipment;
  if (venue === 'gym' && owned) {
    exercises = filterExercisesByEquipment(workout, exercises, owned);
    warmup = filterWarmupByEquipment(workout, warmup, owned);
  }
  const level = getCapability(getCycle()).level;
  exercises = applyCapability(exercises, level);

  /* 新手保护期（v1.5）：Lv.1 零基础用户的高门槛拉类动作自动降成辅助引体机（有器械才换；
   * 用户手动调过难度（ladder 有记录）的动作尊重用户选择，不动）。 */
  if (profile?.experience === 'newbie' && level <= 1) {
    const ladder = getLadderOverrides();
    exercises = exercises.map((e) => {
      const targetId = NEWBIE_LADDER[e.id];
      if (!targetId || ladder[e.id]) return e;
      const target = getExerciseById(targetId);
      if (!target) return e;
      if (owned && !exerciseAvailableWith(target, owned)) return e;
      if (exercises.some((x) => x.id === target.id)) return e; // 避免课内重复
      return target;
    });
  }

  /* 双向调节覆盖（v1.5）：用户点过"做不了/太轻松"的选择，跨课记住 */
  const ladder = getLadderOverrides();
  if (Object.keys(ladder).length > 0) {
    exercises = exercises.map((e) => {
      const t = ladder[e.id];
      if (!t) return e;
      const chosen = getExerciseById(t);
      return chosen ?? e;
    });
  }
  return { warmup, exercises };
}

/** 新手保护期替换表：高门槛动作 → 辅助引体机 */
const NEWBIE_LADDER: Record<string, string> = {
  'pull-up': 'assisted-pullup-machine',
  'chin-up': 'assisted-pullup-machine',
  'dead-hang': 'assisted-pullup-machine',
  'band-assisted-pullup': 'assisted-pullup-machine',
};

/**
 * 今日课程解析便捷版：等价 resolveExercisesForProfile，
 * overrideVenue 缺省时自动读今日场地覆盖（koudai-coach:venueToday:{今天}，null = 跟档案）。
 */
export function resolveTodayExercises(
  workout: Workout,
  profile: UserProfile | null | undefined,
  overrideVenue: Venue | null = getTodayVenue(),
): { warmup: Exercise | null; exercises: Exercise[] } {
  return resolveExercisesForProfile(workout, profile, overrideVenue);
}

/** 估算一节课消耗：kcalPerSet × sets 求和（含热身），"约"字由 UI 加 */
function estimateKcalFrom(warmup: Exercise | null, exercises: Exercise[]): number {
  const all = warmup ? [warmup, ...exercises] : exercises;
  return Math.round(all.reduce((sum, e) => sum + e.kcalPerSet * Math.max(1, e.sets), 0));
}

/**
 * 估算一节课分钟数：5 分钟热身 + 每组 (1 分钟动作 + restSeconds 休息 + ~50 秒换器械)。
 * 6 动作 × 3 组 ≈ 55 分钟，与设计口径一致。
 */
function estimateMinutesFrom(exercises: Exercise[]): number {
  const setsMinutes = exercises.reduce(
    (sum, e) => sum + Math.max(1, e.sets) * (1 + e.restSeconds / 60 + 0.8),
    0,
  );
  return Math.round(5 + setsMinutes);
}

/** 估算一节课消耗：kcalPerSet × sets 求和（含热身），"约"字由 UI 加 */
export function estimateWorkoutKcal(workout: Workout): number {
  const { warmup, exercises } = resolveWorkout(workout);
  return estimateKcalFrom(warmup, exercises);
}

/** 估算一节课分钟数（口径同 estimateMinutesFrom） */
export function estimateWorkoutMinutes(workout: Workout): number {
  const { exercises } = resolveWorkout(workout);
  return estimateMinutesFrom(exercises);
}

/** 下一节课信息 */
export function getNextWorkoutInfo(cycle: CycleState = getCycle()): {
  workout: Workout;
  lessonNumber: number;
  index: number;
} {
  const index = ((cycle.nextWorkoutIndex % program.workouts.length) + program.workouts.length) % program.workouts.length;
  return { workout: program.workouts[index], lessonNumber: index + 1, index };
}

/** getTodayState 可选参数（全部可选，老调用 getTodayState({forceWorkout}, cycle) 行为不变） */
export interface TodayStateOpts {
  /** 用户手动"今天状态好，想练" */
  forceWorkout?: boolean;
  /** 身体档案：有则按场地解析课程变体 */
  profile?: UserProfile | null;
  /** 排期配置：缺省按练一休一 */
  schedule?: ScheduleConfig;
  /** 今日场地覆盖：有值时优先于档案 bestVenue（仅今天，不改档案） */
  overrideVenue?: Venue | null;
}

/**
 * 今天是否排期休息（不看 doneToday，只看排期规则）——v1.5 日期感知版：
 * 旧版只认"最后一条打卡"，哪天没打卡计划就永远卡住（用户吐槽"一直在第一天拖着"）。
 * 新版按真实日期推算（队列语义）：
 * - 1on1off：上次训练是"昨天" → 今天休；更早 → 不管中间歇了几天，今天都该练（计划自动顺延了）
 * - 2on1off：最近两次训练是"昨天+前天"连续两天 → 今天休
 * - weekdays：今天星期不在 schedule.weekdays 里 → 强制休
 */
function isScheduledRest(cycle: CycleState, schedule: ScheduleConfig | undefined): boolean {
  const today = todayStr();
  const yesterday = shiftDate(today, -1);
  const mode = schedule?.mode ?? '1on1off';
  const lastEntry = cycle.history[cycle.history.length - 1] ?? null;
  if (mode === 'weekdays') {
    return !(schedule?.weekdays ?? []).includes(new Date().getDay());
  }
  const nonRest = cycle.history.filter((h) => h.workoutId !== 'REST');
  const lastTrain = nonRest[nonRest.length - 1] ?? null;
  if (mode === '2on1off') {
    if (!lastTrain) return false;
    const second = nonRest[nonRest.length - 2];
    // 连练两天且第二次是昨天 → 今天休；否则该练
    return Boolean(second && lastTrain.date === yesterday && second.date === shiftDate(yesterday, -1));
  }
  // 1on1off：昨天练过 → 今天休；更早练的 → 该练了（自动顺延）
  if (lastEntry !== null && lastEntry.workoutId === 'REST' && lastEntry.date === yesterday) {
    // 昨天主动休息打卡：前天练过 → 今天还休不休？不休——休一就够了，今天该练
    return false;
  }
  return lastTrain !== null && (lastTrain.date === yesterday || lastTrain.date === today);
}

/**
 * 今天该练还是该休：
 * - 今天已有任何打卡 → 休息日态（doneToday=true，今天任务已完成）
 * - 排期规则判定该休 → 休息日态（见 isScheduledRest）
 * - 上次是休息日打卡 或 完全没有记录 → 今天训练（第一课）
 * - opts.forceWorkout：用户手动"今天状态好，想练"
 * - opts.profile：有档案则课程按场地变体解析（热身同理）
 * - opts.overrideVenue：今日场地覆盖，优先级高于档案 bestVenue
 */
export function getTodayState(opts: TodayStateOpts = {}, cycle: CycleState = getCycle()): TodayState {
  const today = todayStr();
  const doneToday = cycle.history.some((h) => h.date === today);
  /* 自由排（v1.5）：dayPlan 覆盖优先于排期规则——'train' 临时加练，'rest' 今天练不了顺延 */
  const dayOverride = getDayPlan()[today];
  const forceByOverride = dayOverride === 'train';
  const shouldRest =
    !opts.forceWorkout &&
    !forceByOverride &&
    (doneToday || dayOverride === 'rest' || isScheduledRest(cycle, opts.schedule));

  const { workout, lessonNumber } = getNextWorkoutInfo(cycle);

  if (shouldRest) {
    return { type: 'rest', nextWorkout: workout, nextLessonNumber: lessonNumber, doneToday };
  }
  const { warmup, exercises } = resolveExercisesForProfile(workout, opts.profile, opts.overrideVenue);
  return {
    type: 'workout',
    workout,
    lessonNumber,
    warmup,
    exercises,
    estimatedKcal: estimateKcalFrom(warmup, exercises),
    estimatedMinutes: estimateMinutesFrom(exercises),
    doneToday,
  };
}

/** 首页时间口吻文案（仅文案变化，不锁功能） */
export function getTimeHint(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 18 && h < 23) return '下班了，走起';
  if (h >= 23 || h < 5) return '太晚了，明天再练也算数';
  return '还没到点？先看看动作预习';
}

/** 这节课里有没有单侧动作（首页提示标签用） */
export function workoutHasUnilateral(workout: Workout): boolean {
  return resolveWorkout(workout).exercises.some((e) => e.unilateral);
}
