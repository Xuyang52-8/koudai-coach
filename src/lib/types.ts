/**
 * 《口袋私教》数据类型契约
 * 与 src/data/ 下 4 个 JSON 一一对应，页面代理请从这里 import type。
 */

/* ---------- exercises.json ---------- */

export interface EquipmentInfo {
  /** 器械名称，如 "跑步机" */
  name: string;
  /** 长什么样（口语描述，给不认识器械的新手） */
  look: string;
  /** 在健身房哪个区域找 */
  where: string;
}

export type ExerciseCategory = 'cardio' | 'pull' | 'legs' | 'push' | 'fullbody' | 'core';

/** 场地：gym=专业健身房 home=居家(瑜伽垫/弹力带/小哑铃) outdoor=户外(单杠/双杠/跑道) bodyweight=纯自重 */
export type Venue = 'gym' | 'home' | 'outdoor' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  /** 目标肌肉，如 "背阔肌、大圆肌" */
  muscle: string;
  category: ExerciseCategory | string;
  /** 可在哪些场地做（新数据必填，旧数据可能缺省） */
  venues?: Venue[];
  /** 有序替代链：没有器械时的替代动作 id，第一个为最优替代 */
  substitutes?: string[];
  equipment: EquipmentInfo;
  /** 口语步骤 */
  steps: string[];
  /** 邪修口诀（一句画面感提示） */
  mantra: string;
  sets: number;
  /** 次数/时长描述，如 "12次" "5分钟" "力竭" */
  reps: string;
  suggestedWeight: string;
  commonMistakes: string[];
  /** 单侧动作：强制左侧先做 */
  unilateral: boolean;
  /** 组间休息秒数，0 = 不计时 */
  restSeconds: number;
  videoKeyword: string;
  /** TTS 朗读脚本 */
  voiceScript: string;
  /** 每组估算消耗大卡 */
  kcalPerSet: number;
}

/* ---------- program.json ---------- */

export interface Workout {
  id: string; // 'A' | 'B' | 'C' | 'D'
  title: string;
  subtitle: string;
  focus: string;
  warmupExerciseId: string;
  exerciseIds: string[];
  /** 分场地课程变体：按用户场地选择对应动作列表（缺省回落 exerciseIds） */
  variants?: Partial<Record<Venue, string[]>>;
  /** 分场地热身变体 */
  warmupVariants?: Partial<Record<Venue, string>>;
  coachNote: string;
}

/* ---------- 用户档案 / 排期（Onboarding 写入，键 koudai-coach:profile / koudai-coach:schedule） ---------- */

export type Gender = 'male' | 'female';
export type ExperienceLevel = 'newbie' | 'some' | 'regular';
export type GoalType = 'cut' | 'recomp' | 'bulk';
/** 1on1off=练一休一 2on1off=练二休一 weekdays=按固定星期 */
export type ScheduleMode = '1on1off' | '2on1off' | 'weekdays';

export interface UserProfile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  experience: ExperienceLevel;
  /** 'none' | 'waist' | 'shoulder' | 'knee' | 'wrist' 多选 */
  injuries: string[];
  /** 左右力量差：right-stronger=右臂强（单侧左先） */
  leftRightDiff: 'none' | 'right-stronger' | 'left-stronger';
  /** 脂肪主要堆积部位：'belly' | 'thigh' | 'arm' | 'overall' 多选 */
  fatAreas: string[];
  /** 饮食习惯：'takeout' | 'home-cook' | 'sugary-drinks' | 'low-protein' 多选 */
  dietHabits: string[];
  /** 可用场地（多选，按优先级取最丰富的一个排课） */
  venues: Venue[];
  goal: GoalType;
  completedAt: number;
}

export interface ScheduleConfig {
  mode: ScheduleMode;
  /** mode==='weekdays' 时生效，0=周日 1=周一 … 6=周六 */
  weekdays: number[];
}

/** 由 UserProfile 计算出的动态营养目标 */
export interface ComputedTargets {
  bmr: number;
  tdee: number;
  targetKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface RestOption {
  icon: 'swim' | 'walk' | 'stretch' | string;
  title: string;
  detail: string;
  durationMin: number;
  kcal: number;
}

export interface RestDay {
  title: string;
  options: RestOption[];
  coachNote: string;
}

export interface Program {
  cycleType: string; // "one-on-one-off"
  workouts: Workout[];
  restDay: RestDay;
  rules: string[];
}

/* ---------- nutrition.json ---------- */

export interface NutritionProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  bmr: number;
  tdee: number;
  targetKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface FoodItem {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unit: string;
  aliases: string[];
}

export interface Supplement {
  id: 'whey' | 'creatine' | string;
  name: string;
  dose: string;
  timing: string;
  kcal: number;
  protein: number;
  note: string;
}

export interface NutritionData {
  profile: NutritionProfile;
  foods: FoodItem[];
  supplements: Supplement[];
  tips: string[];
}

/* ---------- onboarding.json ---------- */

export interface OnboardingData {
  welcome: string;
  disclaimer: string;
  firstWeekTips: string[];
}

/* ---------- localStorage 持久化结构（键空间 koudai-coach:*） ---------- */

/** koudai-coach:cycle */
export interface HistoryEntry {
  /** YYYY-MM-DD 本地日期 */
  date: string;
  /** 训练课 id（'A'..'D'），休息日打卡固定为 'REST' */
  workoutId: string;
  kcal: number;
}

export interface CycleState {
  /** 下一节课在 program.workouts 里的下标 0-3 */
  nextWorkoutIndex: number;
  streak: number;
  /** YYYY-MM-DD | null */
  lastTrainingDate: string | null;
  lastRestDate: string | null;
  history: HistoryEntry[];
}

/** koudai-coach:diet:{YYYY-MM-DD} */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DietEntry {
  id: string;
  label: string;
  kcal: number;
  protein: number;
  meal: MealType;
  source: 'ai' | 'local' | 'manual';
}

/** koudai-coach:supplements:{YYYY-MM-DD} */
export interface SupplementState {
  whey: boolean;
  creatine: boolean;
}

/** koudai-coach:settings */
export interface AppSettings {
  deepseekKey: string;
  visionEndpoint: string;
  visionKey: string;
  visionModel: string;
  ttsOn: boolean;
  /** 倒计时语音子开关 */
  ttsCountdownOn: boolean;
  /** 翻到动作卡自动朗读要领（需 ttsOn 同开）。可选：老用户已存数据缺省，消费端按 ?? true 处理 */
  ttsAuto?: boolean;
  /** 训练时屏幕常亮（Screen Wake Lock）。可选同上，缺省视为 true */
  keepScreenOn?: boolean;
  /** 锁屏后保持语音（静音循环 + Media Session 保活，安卓更有效）。可选同上，缺省视为 true */
  bgAudioKeepAlive?: boolean;
  weightKg: number;
  /** 外观主题：'dark' 黑夜（默认）| 'light' 白天。可选：老用户已存数据缺省，消费端按 ?? 'dark' 处理 */
  theme?: 'dark' | 'light';
  /** 预留：账号体系用户 id（暂不使用，为以后账号/云同步留口） */
  userId?: string;
  /** 预留：授权密钥（暂不使用，为以后密钥体系留口） */
  licenseKey?: string;
}

/** koudai-coach:session —— 进行中的训练（锁屏恢复用） */
export interface WorkoutSession {
  workoutId: string;
  exerciseIndex: number;
  setIndex: number;
  side: 'L' | 'R' | null;
  startedAt: number;
}

/** koudai-coach:checklist:{YYYY-MM-DD} —— 首页出门前 checklist */
export type ChecklistState = Record<string, boolean>;

/* ---------- 今日状态（utils-workout.getTodayState 返回值） ---------- */

export interface TodayWorkoutState {
  type: 'workout';
  workout: Workout;
  /** 第几课（1-4） */
  lessonNumber: number;
  /** 热身动作（可能为 null，数据异常时兜底） */
  warmup: Exercise | null;
  exercises: Exercise[];
  /** 全课估算消耗（kcalPerSet × sets 求和，含热身） */
  estimatedKcal: number;
  /** 估算分钟数（含 5 分钟热身） */
  estimatedMinutes: number;
  /** 这节课今天是否已经打过卡 */
  doneToday: boolean;
}

export interface TodayRestState {
  type: 'rest';
  /** 下一节课信息，休息日卡/循环进度用 */
  nextWorkout: Workout;
  nextLessonNumber: number;
  /** 今天是否已经打过卡（训练或恢复） */
  doneToday: boolean;
}

export type TodayState = TodayWorkoutState | TodayRestState;

/* ---------- AI 估算结果 ---------- */

export interface FoodEstimateItem {
  label: string;
  kcal: number;
  protein: number;
  source: 'ai' | 'local';
}

export interface FoodEstimateResult {
  items: FoodEstimateItem[];
}
