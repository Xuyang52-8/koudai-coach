/**
 * 训练相关纯函数工具：今日状态推算、消耗估算、动作解析。
 * 练一休一逻辑：只看 history 里"完成事件"，不认星期、不认日期连续性。
 */
import exercisesJson from '../data/exercises.json';
import programJson from '../data/program.json';
import { getCycle, getCustomExercises, todayStr } from './store';
import type { CycleState, Exercise, Program, TodayState, Workout } from './types';

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

/** 估算一节课消耗：kcalPerSet × sets 求和（含热身），"约"字由 UI 加 */
export function estimateWorkoutKcal(workout: Workout): number {
  const { warmup, exercises } = resolveWorkout(workout);
  const all = warmup ? [warmup, ...exercises] : exercises;
  return Math.round(all.reduce((sum, e) => sum + e.kcalPerSet * Math.max(1, e.sets), 0));
}

/**
 * 估算一节课分钟数：5 分钟热身 + 每组 (1 分钟动作 + restSeconds 休息 + ~50 秒换器械)。
 * 6 动作 × 3 组 ≈ 55 分钟，与设计口径一致。
 */
export function estimateWorkoutMinutes(workout: Workout): number {
  const { exercises } = resolveWorkout(workout);
  const setsMinutes = exercises.reduce(
    (sum, e) => sum + Math.max(1, e.sets) * (1 + e.restSeconds / 60 + 0.8),
    0,
  );
  return Math.round(5 + setsMinutes);
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

/**
 * 今天该练还是该休：
 * - 今天已有任何打卡 → 休息日态（doneToday=true，今天任务已完成）
 * - 上次完成的是训练 → 今天休息
 * - 上次是休息日打卡 或 完全没有记录 → 今天训练（第一课）
 * - opts.forceWorkout：用户手动"今天状态好，想练"
 */
export function getTodayState(opts: { forceWorkout?: boolean } = {}, cycle: CycleState = getCycle()): TodayState {
  const today = todayStr();
  const doneToday = cycle.history.some((h) => h.date === today);
  const lastEntry = cycle.history[cycle.history.length - 1] ?? null;
  const shouldRest = !opts.forceWorkout && (doneToday || (lastEntry !== null && lastEntry.workoutId !== 'REST'));

  const { workout, lessonNumber } = getNextWorkoutInfo(cycle);

  if (shouldRest) {
    return { type: 'rest', nextWorkout: workout, nextLessonNumber: lessonNumber, doneToday };
  }
  const { warmup, exercises } = resolveWorkout(workout);
  return {
    type: 'workout',
    workout,
    lessonNumber,
    warmup,
    exercises,
    estimatedKcal: estimateWorkoutKcal(workout),
    estimatedMinutes: estimateWorkoutMinutes(workout),
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
