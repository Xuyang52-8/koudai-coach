/**
 * 训练完成快照（koudai-coach:workoutExtra）—— Workout 页收尾时写入，Summary 页读取。
 * 用 store 的通用 useStoreKey 读写，不改 lib。
 * 跳过动作名单单独按天存（koudai-coach:skips:{date}），刷新不丢。
 */
import { useStoreKey } from '../../lib/store';

export interface WorkoutExtra {
  /** 完成日 YYYY-MM-DD（跨天作废判断用） */
  date: string;
  workoutId: string;
  lessonNumber: number;
  /** 如 "下肢+核心日" */
  workoutTitle: string;
  /** 如 "腿+臀+腹部" */
  workoutSubtitle: string;
  /** 估算消耗（kcalPerSet×sets 求和，UI 层加"约"） */
  kcal: number;
  /** 点"开始训练"的时间戳 */
  startedAt: number;
  /** 最后一个动作完成的时间戳 */
  finishedAt: number;
  /** 实际完成组数（跳过的不计） */
  doneSets: number;
  /** 全课总组数 */
  totalSets: number;
  /** 跳过的动作名 */
  skipped: string[];
  /** Summary 是否已调用 completeWorkout（防重复推进循环） */
  counted: boolean;
}

export function useWorkoutExtra(): [WorkoutExtra | null, (next: WorkoutExtra | null | ((p: WorkoutExtra | null) => WorkoutExtra | null)) => void] {
  return useStoreKey<WorkoutExtra | null>('workoutExtra', null);
}

/** 跳过记录：动作名 + 跳过前已完成的组数（总结页"完成 X/Y 组"口径用） */
export interface SkipEntry {
  name: string;
  doneSets: number;
}

/** 本课跳过的动作（按天键，刷新恢复） */
export function useSkips(date: string): [SkipEntry[], (next: SkipEntry[] | ((p: SkipEntry[]) => SkipEntry[])) => void] {
  return useStoreKey<SkipEntry[]>(`skips:${date}`, []);
}
