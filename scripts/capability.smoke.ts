/**
 * capability.ts + 今日场地覆盖 Node 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx esbuild scripts/capability.smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/capability.smoke.mjs
 *   node /tmp/capability.smoke.mjs
 * 覆盖：
 *   - getCapability 等级边界（0/4/5/12/13 节课）、REST 不计数、label/coachNote
 *   - applyCapability：Lv.1 原样、Lv.2 力量 reps +2 组数不变、Lv.3 前 3 个力量组数 +1 封顶 5、
 *     cardio/core 不动、力竭/时长类 reps 不动、不改原对象
 *   - resolveExercisesForProfile：overrideVenue 优先级（今日选择 > 档案）、无档案也能用今日场地、
 *     缺变体回落 exerciseIds、变体全失效回落原始课程、热身 warmupVariants 同理
 *   - resolveTodayExercises 便捷函数
 * 注：Node 下无 localStorage，getCycle() 走 try/catch 回落空 history → 解析链路里能力等级恒 Lv.1（原样），
 *     所以场地断言看到的就是基准 reps/sets。
 */
import assert from 'node:assert/strict';
import { applyCapability, getCapability } from '../src/lib/capability';
import type { CycleState, Exercise, HistoryEntry, UserProfile, Workout } from '../src/lib/types';
import { resolveExercisesForProfile, resolveTodayExercises } from '../src/lib/utils-workout';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

function makeCycle(lessons: number, restDays = 0): CycleState {
  const history: HistoryEntry[] = [];
  for (let i = 0; i < lessons; i++) {
    history.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, workoutId: 'A', kcal: 300 });
  }
  for (let i = 0; i < restDays; i++) {
    history.push({ date: `2025-02-${String(i + 1).padStart(2, '0')}`, workoutId: 'REST', kcal: 0 });
  }
  return { nextWorkoutIndex: 0, streak: 0, lastTrainingDate: null, lastRestDate: null, history };
}

function makeEx(over: Partial<Exercise>): Exercise {
  return {
    id: 'test-ex',
    name: '测试动作',
    muscle: '背',
    category: 'pull',
    equipment: { name: '单杠', look: '', where: '' },
    steps: [],
    mantra: '',
    sets: 3,
    reps: '10-12',
    suggestedWeight: '自重',
    commonMistakes: [],
    unilateral: false,
    restSeconds: 60,
    videoKeyword: '',
    voiceScript: '',
    kcalPerSet: 5,
    ...over,
  };
}

/* ================= getCapability：等级边界 ================= */

ok('0 节课 → Lv.1 新手村（含 4 节边界内文案）', () => {
  const c0 = getCapability(makeCycle(0));
  assert.equal(c0.level, 1);
  assert.equal(c0.lessonsDone, 0);
  assert.equal(c0.label, '新手村');
  assert.equal(c0.coachNote, '先把动作做标准，重量会自己来找你');
  assert.equal(getCapability(makeCycle(4)).level, 1);
});

ok('5 节课 → Lv.2 上手期；12 节仍是 Lv.2', () => {
  const c5 = getCapability(makeCycle(5));
  assert.equal(c5.level, 2);
  assert.equal(c5.lessonsDone, 5);
  assert.equal(c5.label, '上手期');
  assert.equal(c5.coachNote, '动作成型了，开始给你加点量');
  assert.equal(getCapability(makeCycle(12)).level, 2);
});

ok('13 节课 → Lv.3 稳步进阶', () => {
  const c13 = getCapability(makeCycle(13));
  assert.equal(c13.level, 3);
  assert.equal(c13.lessonsDone, 13);
  assert.equal(c13.label, '稳步进阶');
  assert.equal(c13.coachNote, '你不再是新手了，强度和容量都上调');
  assert.equal(getCapability(makeCycle(30)).level, 3);
});

ok('REST 打卡不计入课数：4 课 + 5 个 REST → 仍 Lv.1（lessonsDone=4）', () => {
  const c = getCapability(makeCycle(4, 5));
  assert.equal(c.lessonsDone, 4);
  assert.equal(c.level, 1);
});

/* ================= applyCapability ================= */

ok('Lv.1：原样返回（新数组、原对象引用、内容不变）', () => {
  const input = [makeEx({ id: 'a' }), makeEx({ id: 'b', category: 'core', reps: '每组30-45秒' })];
  const out = applyCapability(input, 1);
  assert.notEqual(out, input); // 新数组
  assert.equal(out[0], input[0]); // 原对象不动
  assert.equal(out[0].reps, '10-12');
  assert.equal(out[0].sets, 3);
});

ok('Lv.2：力量动作 reps +2（10-12→12-14），组数不变；core/cardio 不动', () => {
  const input = [
    makeEx({ id: 's', category: 'pull', reps: '10-12', sets: 4 }),
    makeEx({ id: 'c', category: 'core', reps: '每侧10次', sets: 3 }),
    makeEx({ id: 'w', category: 'cardio', reps: '5分钟', sets: 1 }),
  ];
  const out = applyCapability(input, 2);
  assert.equal(out[0].reps, '12-14');
  assert.equal(out[0].sets, 4); // 组数不变
  assert.notEqual(out[0], input[0]); // 新对象
  assert.equal(out[1], input[1]); // core 原引用
  assert.equal(out[2], input[2]); // cardio 原引用
  assert.equal(input[0].reps, '10-12'); // 原对象没被改
});

ok('Lv.2：力量动作里的力竭/时长类 reps 不可平移（保持原文）', () => {
  const input = [
    makeEx({ id: 'p', category: 'pull', reps: '力竭前留1个（目前每组2-4个）' }),
    makeEx({ id: 'f', category: 'fullbody', reps: '每组30-40秒' }),
    makeEx({ id: 'u', category: 'legs', reps: '每侧10-12（左侧先做，次数以左侧为准）' }),
  ];
  const out = applyCapability(input, 2);
  assert.equal(out[0].reps, '力竭前留1个（目前每组2-4个）');
  assert.equal(out[1].reps, '每组30-40秒');
  assert.equal(out[2].reps, '每侧12-14（左侧先做，次数以左侧为准）'); // 只动目标段
});

ok('Lv.3：全部力量 reps +2，且仅前 3 个力量动作组数 +1（封顶 5）', () => {
  const input = [
    makeEx({ id: 's1', category: 'pull', reps: '10-12', sets: 3 }),
    makeEx({ id: 'core', category: 'core', reps: '每组30-45秒', sets: 3 }), // 不占力量名额
    makeEx({ id: 's2', category: 'legs', reps: '8-10', sets: 4 }),
    makeEx({ id: 's3', category: 'push', reps: '10-12', sets: 5 }), // 已 5 组，封顶
    makeEx({ id: 's4', category: 'fullbody', reps: '8-15（力竭前留1个就停）', sets: 3 }), // 第 4 个力量，不加组
  ];
  const out = applyCapability(input, 3);
  assert.deepEqual(
    out.map((e) => [e.id, e.sets]),
    [
      ['s1', 4], // 第 1 个力量 +1
      ['core', 3], // core 不动
      ['s2', 5], // 第 2 个力量 +1
      ['s3', 5], // 第 3 个力量 +1 但封顶 5
      ['s4', 3], // 第 4 个力量不加组
    ],
  );
  assert.equal(out[0].reps, '12-14');
  assert.equal(out[1], input[1]); // core 原引用
  assert.equal(out[4].reps, '10-17（力竭前留1个就停）'); // 第 4 个力量 reps 仍 +2
  // 原数组/原对象未变异
  assert.equal(input[0].sets, 3);
  assert.equal(input[0].reps, '10-12');
});

/* ================= resolveExercisesForProfile：overrideVenue 优先级与回落 ================= */

const PROFILE_GYM = { venues: ['gym'] } as UserProfile;

/** 测试课：gym / outdoor 两套变体 + outdoor 热身变体 */
const WK: Workout = {
  id: 'T',
  title: '测试课',
  subtitle: '测试',
  focus: '',
  warmupExerciseId: 'treadmill-incline-walk',
  exerciseIds: ['lat-pulldown', 'plank'],
  variants: {
    gym: ['lat-pulldown', 'db-curl'],
    outdoor: ['pull-up', 'dead-hang'],
  },
  warmupVariants: { outdoor: 'outdoor-run' },
  coachNote: '',
};

const ids = (list: Exercise[]): string[] => list.map((e) => e.id);

ok('跟档案（override 缺省/null）：按 bestVenue=gym 解析变体 + 默认热身', () => {
  const a = resolveExercisesForProfile(WK, PROFILE_GYM);
  assert.deepEqual(ids(a.exercises), ['lat-pulldown', 'db-curl']);
  assert.equal(a.warmup?.id, 'treadmill-incline-walk');
  const b = resolveExercisesForProfile(WK, PROFILE_GYM, null);
  assert.deepEqual(ids(b.exercises), ['lat-pulldown', 'db-curl']);
});

ok('今日选择 > 档案：override=outdoor 用 outdoor 变体 + outdoor 热身变体', () => {
  const r = resolveExercisesForProfile(WK, PROFILE_GYM, 'outdoor');
  assert.deepEqual(ids(r.exercises), ['pull-up', 'dead-hang']);
  assert.equal(r.warmup?.id, 'outdoor-run'); // warmupVariants 同理
});

ok('无档案也能用今日场地：override=outdoor + profile=null', () => {
  const r = resolveExercisesForProfile(WK, null, 'outdoor');
  assert.deepEqual(ids(r.exercises), ['pull-up', 'dead-hang']);
  assert.equal(r.warmup?.id, 'outdoor-run');
});

ok('缺变体回落 exerciseIds：override=home（无 home 变体）', () => {
  const r = resolveExercisesForProfile(WK, PROFILE_GYM, 'home');
  assert.deepEqual(ids(r.exercises), ['lat-pulldown', 'plank']);
  assert.equal(r.warmup?.id, 'treadmill-incline-walk'); // warmupVariants.home 缺省 → 默认热身
});

ok('变体全失效回落 exerciseIds：变体 id 全部查不到', () => {
  const broken: Workout = { ...WK, variants: { outdoor: ['nope-1', 'nope-2'] } };
  const r = resolveExercisesForProfile(broken, PROFILE_GYM, 'outdoor');
  assert.deepEqual(ids(r.exercises), ['lat-pulldown', 'plank']);
  assert.equal(r.warmup?.id, 'treadmill-incline-walk'); // 整体回落 resolveWorkout，热身也回默认
});

ok('无档案无覆盖：等价 resolveWorkout（原始 exerciseIds）', () => {
  const r = resolveExercisesForProfile(WK, null);
  assert.deepEqual(ids(r.exercises), ['lat-pulldown', 'plank']);
  assert.equal(r.warmup?.id, 'treadmill-incline-walk');
});

ok('解析链路带能力引擎：Node 空 history → Lv.1 原样（reps/sets 不变）', () => {
  const r = resolveExercisesForProfile(WK, PROFILE_GYM);
  const pulldown = r.exercises.find((e) => e.id === 'lat-pulldown');
  assert.equal(pulldown?.reps, '10-12');
  assert.equal(pulldown?.sets, 4);
});

ok('resolveTodayExercises：显式传 override 与 resolveExercisesForProfile 一致', () => {
  const r = resolveTodayExercises(WK, PROFILE_GYM, 'outdoor');
  assert.deepEqual(ids(r.exercises), ['pull-up', 'dead-hang']);
  assert.equal(r.warmup?.id, 'outdoor-run');
  // 显式 null = 跟档案（Node 无存储，缺省读出来也是 null，同路径）
  const d = resolveTodayExercises(WK, PROFILE_GYM, null);
  assert.deepEqual(ids(d.exercises), ['lat-pulldown', 'db-curl']);
});

console.log(`\n${passed} 项全部通过`);
