/**
 * adjust.ts 纯规则 Node 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx esbuild scripts/adjust.smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/adjust.smoke.mjs
 *   node /tmp/adjust.smoke.mjs
 * 覆盖：连续累加、20kg 档位切换、50%/60% 下限钳制、reps 字符串平移、非数字/时长 reps 不动、
 *       hardStreak 连续喊累提示、刚好清零、history 只留 10 条。
 */
import assert from 'node:assert/strict';
import {
  adjustedReps,
  adjustedWeightKg,
  applyRpe,
  hasAdjustment,
  overrideDeltaText,
  repsLowerBound,
  rpeToast,
  shiftReps,
} from '../src/lib/adjust';
import type { ExerciseOverride } from '../src/lib/adjust';
import type { Exercise } from '../src/lib/types';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

function makeEx(over: Partial<Exercise>): Exercise {
  return {
    id: 'test-ex',
    name: '测试动作',
    muscle: '胸',
    category: 'push',
    equipment: { name: '哑铃', look: '', where: '' },
    steps: [],
    mantra: '',
    sets: 3,
    reps: '10-12',
    suggestedWeight: '每只手7.5kg开始',
    commonMistakes: [],
    unilateral: false,
    restSeconds: 60,
    videoKeyword: '',
    voiceScript: '',
    kcalPerSet: 5,
    ...over,
  };
}

const DUMBBELL_75 = makeEx({}); // 7.5kg 哑铃 / 10-12
const BODYWEIGHT = makeEx({ id: 'bw', suggestedWeight: '自重，能轻松做15个再考虑负重', reps: '10-12' });
const T0 = new Date('2025-01-15T10:00:00').getTime();

function chain(ex: Exercise, rpes: ('easy' | 'ok' | 'hard')[]): ExerciseOverride {
  let ov: ExerciseOverride | null = null;
  rpes.forEach((rpe, i) => {
    ov = applyRpe(ov, ex, rpe, T0 + i * 86_400_000);
  });
  return ov as ExerciseOverride;
}

/* ---------- 太轻松：累加 + 档位 ---------- */
ok('7.5kg 哑铃连续两次太轻松 → +5kg 累计，调到 12.5kg', () => {
  const ov = chain(DUMBBELL_75, ['easy', 'easy']);
  assert.equal(ov.weightDeltaKg, 5);
  assert.equal(adjustedWeightKg(DUMBBELL_75, ov), 12.5);
  assert.equal(rpeToast(DUMBBELL_75, ov, 'easy'), '记下了，下次加到 12.5kg');
});

ok('当前重量 <20kg 按 +2.5，≥20kg 按 +5（17.5 → 20 → 25）', () => {
  const ex = makeEx({ suggestedWeight: '每只手17.5kg开始' });
  const s1 = applyRpe(null, ex, 'easy', T0);
  assert.equal(s1.weightDeltaKg, 2.5); // 17.5 < 20 → +2.5 → 当前 20
  const s2 = applyRpe(s1, ex, 'easy', T0);
  assert.equal(s2.weightDeltaKg, 7.5); // 当前 20 ≥ 20 → +5
  assert.equal(adjustedWeightKg(ex, s2), 25);
});

ok('自重类太轻松 → repsDelta +2，10-12 → 12-14', () => {
  const ov = applyRpe(null, BODYWEIGHT, 'easy', T0);
  assert.equal(ov.repsDelta, 2);
  assert.equal(adjustedReps(BODYWEIGHT, ov), '12-14');
});

/* ---------- 太累：减重 + 下限钳制 + hardStreak ---------- */
ok('20kg 起步太累 → 按 -5 降到 15kg', () => {
  const ex = makeEx({ suggestedWeight: '空杆20kg起步' });
  const ov = applyRpe(null, ex, 'hard', T0);
  assert.equal(ov.weightDeltaKg, -5);
  assert.equal(adjustedWeightKg(ex, ov), 15);
  assert.equal(ov.hardStreak, 1);
});

ok('重量下限：不低于基准 50%（10kg 连续太累，钳到 5kg 不再降）', () => {
  const ex = makeEx({ suggestedWeight: '插片10kg起步' });
  const ov = chain(ex, ['hard', 'hard', 'hard', 'hard']);
  assert.equal(ov.weightDeltaKg, -5); // -2.5 -2.5 后触底
  assert.equal(adjustedWeightKg(ex, ov), 5);
  assert.equal(ov.hardStreak, 4);
});

ok('自重类太累：次数下限不低于基准下限 60%（10-12 钳到 6-8）', () => {
  const ov = chain(BODYWEIGHT, ['hard', 'hard', 'hard']);
  assert.equal(ov.repsDelta, -4); // 下限 10 的 60% = 6
  assert.equal(adjustedReps(BODYWEIGHT, ov), '6-8');
});

ok('连续两次太累 toast 追加替代动作降档提示（且撞 50% 下限：7.5kg → 3.8kg）', () => {
  const ov = chain(DUMBBELL_75, ['hard', 'hard']);
  // hard1: 7.5-2.5=5；hard2: 5-2.5=2.5 < 基准 50%(3.75) → 钳到 3.8
  assert.equal(ov.weightDeltaKg, -3.7);
  assert.equal(adjustedWeightKg(DUMBBELL_75, ov), 3.8);
  const msg = rpeToast(DUMBBELL_75, ov, 'hard');
  assert.match(msg, /下次减到 3.8kg，姿势先对/);
  assert.match(msg, /连续喊累啦，下次可以点「换替代动作」降一档难度/);
});

/* ---------- 刚好：不动量，hardStreak 清零 ---------- */
ok('刚好：调整量保持，hardStreak 清零', () => {
  const afterEasy = applyRpe(null, DUMBBELL_75, 'easy', T0);
  const afterHard2 = chain(DUMBBELL_75, ['hard', 'hard']);
  const okOv = applyRpe(afterHard2, DUMBBELL_75, 'ok', T0);
  assert.equal(okOv.hardStreak, 0);
  assert.equal(okOv.weightDeltaKg, afterHard2.weightDeltaKg); // 量不变
  assert.equal(rpeToast(DUMBBELL_75, okOv, 'ok'), '好，保持这个量，稳住');
  const easyThenOk = applyRpe(afterEasy, DUMBBELL_75, 'ok', T0);
  assert.equal(easyThenOk.weightDeltaKg, 2.5);
});

ok('首次评价就刚好 → 记录存在但无调整量（不亮「已为你调整」）', () => {
  const ov = applyRpe(null, DUMBBELL_75, 'ok', T0);
  assert.equal(hasAdjustment(ov), false);
  assert.equal(overrideDeltaText(DUMBBELL_75, ov), '基准量，还没动');
});

/* ---------- reps 字符串平移 ---------- */
ok('区间同加同减："10-12" ±2 → "12-14" / "8-10"，下限钳到 1', () => {
  assert.equal(shiftReps('10-12', 2), '12-14');
  assert.equal(shiftReps('10-12', -2), '8-10');
  assert.equal(shiftReps('10-12', -15), '1-1');
});

ok('带说明的 reps 只动目标段："每侧10-12（左侧先做…）" +2', () => {
  assert.equal(shiftReps('每侧10-12（左侧先做，次数以左侧为准）', 2), '每侧12-14（左侧先做，次数以左侧为准）');
  assert.equal(shiftReps('每侧8-10步（左腿先迈，步数以左侧为准）', -2), '每侧6-8步（左腿先迈，步数以左侧为准）');
  assert.equal(shiftReps('15次', 2), '17次');
  assert.equal(shiftReps('8-15（力竭前留1个就停）', 2), '10-17（力竭前留1个就停）');
});

ok('非计次数 reps 不动："力竭" / "5分钟" / "30-60秒" / "力竭前留1个"', () => {
  assert.equal(shiftReps('力竭', 2), '力竭');
  assert.equal(shiftReps('5分钟', 2), '5分钟');
  assert.equal(shiftReps('每组30-45秒', -2), '每组30-45秒');
  assert.equal(shiftReps('30-60秒（热身用）', 2), '30-60秒（热身用）');
  assert.equal(shiftReps('每组往返走30-40米', 2), '每组往返走30-40米');
  assert.equal(shiftReps('力竭前留1个（目前每组2-4个）', 2), '力竭前留1个（目前每组2-4个）');
  assert.equal(shiftReps('每组吊到力竭，记录秒数', 2), '每组吊到力竭，记录秒数');
});

ok('repsLowerBound：计次数取首数字，力竭/时长类 null', () => {
  assert.equal(repsLowerBound('10-12'), 10);
  assert.equal(repsLowerBound('每侧8-10步（左腿先迈）'), 8);
  assert.equal(repsLowerBound('5分钟'), null);
  assert.equal(repsLowerBound('力竭前留1个（目前每组2-4个）'), null);
});

/* ---------- history：只留最近 10 条 ---------- */
ok('history 只留最近 10 条，顺序从旧到新', () => {
  const ov = chain(DUMBBELL_75, Array(12).fill('easy'));
  assert.equal(ov.history.length, 10);
  assert.equal(ov.history[9].rpe, 'easy');
  assert.equal(ov.history[0].date < ov.history[9].date, true);
});

/* ---------- 展示辅助 ---------- */
ok('overrideDeltaText：重量/次数/基准三种口径', () => {
  const w = chain(DUMBBELL_75, ['easy']);
  assert.equal(overrideDeltaText(DUMBBELL_75, w), '重量 +2.5kg');
  const r = chain(BODYWEIGHT, ['hard']);
  assert.equal(overrideDeltaText(BODYWEIGHT, r), '次数 -2');
  assert.equal(overrideDeltaText(null, w), '重量 +2.5kg'); // 动作被删也能显示
});

console.log(`\n${passed} 项全部通过`);
