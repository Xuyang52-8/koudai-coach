/**
 * growth.ts 纯聚合层 Node 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx esbuild scripts/growth.smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/growth.smoke.mjs
 *   node /tmp/growth.smoke.mjs
 * 覆盖三板块：
 *   1. 训练日历：42 格周一开头、邻月补位、workout/mini/rest 优先级与月度统计、当天摘要
 *   2. 力量成长线：RPE 历史回放重量/次数、最多 5 条、人话点评（加重/持平/恢复）、
 *      自重类次数线、手动重量兜底、倒序
 *   3. 里程碑：课数 / 连续打卡 / 首次小练 / 首次连续 3 次加重的判定与达成日
 */
import assert from 'node:assert/strict';
import { applyRpe } from '../src/lib/adjust';
import type { ExerciseOverride } from '../src/lib/adjust';
import {
  buildDayDetail,
  buildGrowthData,
  buildMilestones,
  buildMonthCalendar,
  buildStrengthCards,
  dayKind,
  longestRun,
  miniName,
  shiftDay,
  shiftMonth,
} from '../src/lib/growth';
import type { CalendarInput, MilestoneInput } from '../src/lib/growth';
import type { CycleState, Exercise, HistoryEntry } from '../src/lib/types';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

/* ---------- mock 工具 ---------- */

function makeEx(over: Partial<Exercise>): Exercise {
  return {
    id: 'test-ex',
    name: '哑铃划船',
    muscle: '背',
    category: 'pull',
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

const DUMBBELL_75 = makeEx({});
const BODYWEIGHT = makeEx({ id: 'bw', name: '深蹲', suggestedWeight: '自重', reps: '12-15' });

/** 用真实 applyRpe 链出覆盖记录（日期从 baseDate 起逐天 +1） */
function chain(ex: Exercise, rpes: ('easy' | 'ok' | 'hard')[], baseDate = '2025-01-05'): ExerciseOverride {
  let ov: ExerciseOverride | null = null;
  rpes.forEach((rpe, i) => {
    const now = new Date(shiftDay(baseDate, i) + 'T10:00:00').getTime();
    ov = applyRpe(ov, ex, rpe, now);
  });
  return ov as ExerciseOverride;
}

function hist(entries: [string, string, number][]): HistoryEntry[] {
  return entries.map(([date, workoutId, kcal]) => ({ date, workoutId, kcal }));
}

/* ================= 1. 训练日历 ================= */

const CAL_INPUT: CalendarInput = {
  history: hist([
    ['2025-01-02', 'A', 320],
    ['2025-01-04', 'B', 380],
    ['2025-01-06', 'REST', 120],
    ['2025-01-08', 'C', 300],
    ['2025-01-08', 'REST', 0], // 同一天训练+休息打卡（边界）
  ]),
  minisByDate: {
    '2025-01-04': ['hip'], // 与训练同一天 → 仍算训练日
    '2025-01-07': ['kegel-m', 'posture'], // 只小练 → 小练日
    '2025-01-06': ['legs'], // 与 REST 同一天 → 小练优先（黄点）
  },
};

ok('月历 42 格、周一开头、邻月补位（2025-01 → 首格 2024-12-30）', () => {
  const cal = buildMonthCalendar(2025, 1, CAL_INPUT, '2025-01-15');
  assert.equal(cal.cells.length, 42);
  assert.equal(cal.label, '2025 年 1 月');
  assert.equal(cal.cells[0].date, '2024-12-30');
  assert.equal(cal.cells[0].inMonth, false);
  assert.equal(cal.cells[2].date, '2025-01-01');
  assert.equal(cal.cells[2].inMonth, true);
  assert.equal(cal.cells[2].day, 1);
  // 今天/未来标记
  const todayCell = cal.cells.find((c) => c.date === '2025-01-15');
  assert.equal(todayCell?.isToday, true);
  assert.equal(todayCell?.isFuture, false);
  assert.equal(cal.cells.find((c) => c.date === '2025-01-16')?.isFuture, true);
});

ok('点色优先级：训练 > 小练 > 休息打卡；月度统计正确', () => {
  assert.equal(dayKind('2025-01-02', CAL_INPUT), 'workout');
  assert.equal(dayKind('2025-01-04', CAL_INPUT), 'workout'); // 训练+小练同日
  assert.equal(dayKind('2025-01-07', CAL_INPUT), 'mini');
  assert.equal(dayKind('2025-01-06', CAL_INPUT), 'mini'); // REST+小练 → 黄点
  assert.equal(dayKind('2025-01-10', CAL_INPUT), null);
  const cal = buildMonthCalendar(2025, 1, CAL_INPUT, '2025-01-15');
  assert.equal(cal.workoutDays, 3); // 01-02 / 01-04 / 01-08
  assert.equal(cal.miniDays, 2); // 01-06 / 01-07
  assert.equal(cal.restDays, 0);
  const calRest = buildMonthCalendar(2025, 1, { history: hist([['2025-01-03', 'REST', 60]]), minisByDate: {} }, '2025-01-15');
  assert.equal(calRest.restDays, 1);
});

ok('当天摘要：课序号/时长/消耗/小练包名/总消耗', () => {
  const d = buildDayDetail('2025-01-04', CAL_INPUT);
  assert.ok(d);
  assert.equal(d.kind, 'workout');
  assert.equal(d.workouts.length, 1);
  assert.equal(d.workouts[0].lessonNumber, 2); // B 课
  assert.equal(d.workouts[0].title, '下肢+核心日');
  assert.ok(d.workouts[0].minutes > 0);
  assert.equal(d.workouts[0].kcal, 380);
  assert.deepEqual(d.minis, ['髋部灵活']);
  assert.equal(d.kcalTotal, 380);

  const rest = buildDayDetail('2025-01-08', CAL_INPUT);
  assert.ok(rest);
  assert.equal(rest.workouts.length, 1);
  assert.equal(rest.restKcal, 0); // REST 记录存在，kcal 0
  assert.equal(rest.kcalTotal, 300);

  const mini = buildDayDetail('2025-01-07', CAL_INPUT);
  assert.ok(mini);
  assert.equal(mini.kind, 'mini');
  assert.deepEqual(mini.minis, ['盆底肌训练（男）', '体态矫正']);
  assert.equal(mini.workouts.length, 0);

  assert.equal(buildDayDetail('2025-01-20', CAL_INPUT), null);
});

ok('shiftDay / shiftMonth 跨年边界 + 小练名兜底', () => {
  assert.equal(shiftDay('2025-01-01', -1), '2024-12-31');
  assert.deepEqual(shiftMonth(2025, 1, -1), { year: 2024, month: 12 });
  assert.deepEqual(shiftMonth(2025, 12, 1), { year: 2026, month: 1 });
  assert.deepEqual(shiftMonth(2025, 6, 0), { year: 2025, month: 6 });
  assert.equal(miniName('hip'), '髋部灵活');
  assert.equal(miniName('no-such-pack'), 'no-such-pack');
});

/* ================= 2. 力量成长线 ================= */

ok('连续 3 次太轻松 → 回放 7.5→10→12.5→15kg，点评「连续 3 次加重，稳」', () => {
  const ov = chain(DUMBBELL_75, ['easy', 'easy', 'easy']);
  const cards = buildStrengthCards([{ exercise: DUMBBELL_75, baseKg: 7.5, override: ov, manualKg: null }]);
  assert.equal(cards.length, 1);
  const c = cards[0];
  assert.equal(c.name, '哑铃划船');
  assert.equal(c.weighted, true);
  assert.equal(c.records.length, 3);
  assert.deepEqual(c.records.map((r) => r.kg), [10, 12.5, 15]); // 当前 <20kg 每档 +2.5
  assert.deepEqual(c.records.map((r) => r.delta), [2.5, 2.5, 2.5]);
  assert.equal(c.verdict, '连续 3 次加重，稳');
  assert.equal(c.trend, 'up');
  assert.equal(c.currentLabel, '15kg × 10-12');
  assert.equal(c.totalCount, 3);
});

ok('最后一次太累 → 「上次减了重量，恢复中」+ trend down', () => {
  const ov = chain(DUMBBELL_75, ['easy', 'easy', 'hard']);
  const cards = buildStrengthCards([{ exercise: DUMBBELL_75, baseKg: 7.5, override: ov, manualKg: null }]);
  const c = cards[0];
  assert.equal(c.records[2].kg, 10); // 12.5 - 2.5
  assert.equal(c.records[2].delta, -2.5);
  assert.equal(c.verdict, '上次减了重量，恢复中');
  assert.equal(c.trend, 'down');
});

ok('全刚好 → 「这周持平，正常」；首次刚好 → 「第一次记录，基准线在这了」', () => {
  const flat = buildStrengthCards([{ exercise: DUMBBELL_75, baseKg: 7.5, override: chain(DUMBBELL_75, ['ok', 'ok']), manualKg: null }]);
  assert.equal(flat[0].verdict, '这周持平，正常');
  assert.equal(flat[0].trend, 'flat');
  const first = buildStrengthCards([{ exercise: DUMBBELL_75, baseKg: 7.5, override: chain(DUMBBELL_75, ['ok']), manualKg: null }]);
  assert.equal(first[0].verdict, '第一次记录，基准线在这了');
});

ok('自重类：回放次数平移 12-15 → 14-17，点评用「加量」', () => {
  const ov = chain(BODYWEIGHT, ['easy', 'easy', 'easy']);
  const cards = buildStrengthCards([{ exercise: BODYWEIGHT, baseKg: null, override: ov, manualKg: null }]);
  const c = cards[0];
  assert.equal(c.weighted, false);
  assert.equal(c.records[0].kg, null);
  assert.deepEqual(c.records.map((r) => r.reps), ['14-17', '16-19', '18-21']);
  assert.equal(c.verdict, '连续 3 次加量，稳');
  assert.equal(c.currentLabel, '自重 × 18-21');
});

ok('历史最多 5 条（留最近），手动重量优先当前量，无记录动作不显示', () => {
  const ov = chain(DUMBBELL_75, Array(8).fill('easy'));
  const cards = buildStrengthCards([
    { exercise: DUMBBELL_75, baseKg: 7.5, override: ov, manualKg: 22.5 },
    { exercise: makeEx({ id: 'never', name: '没练过' }), baseKg: 7.5, override: null, manualKg: null },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].records.length, 5);
  assert.equal(cards[0].currentLabel, '22.5kg × 10-12'); // 手动步进值优先
});

ok('只有手动重量（无 RPE）→ 出卡 + 提示文案；多张卡按最近记录倒序', () => {
  const manualOnly = buildStrengthCards([{ exercise: DUMBBELL_75, baseKg: 7.5, override: null, manualKg: 10 }]);
  assert.equal(manualOnly.length, 1);
  assert.equal(manualOnly[0].records.length, 0);
  assert.equal(manualOnly[0].verdict, '重量是你自己调的；练完评一次 RPE，这里开始记趋势');
  assert.equal(manualOnly[0].totalCount, 0);

  const older = chain(makeEx({ id: 'old', name: '旧动作' }), ['easy'], '2025-01-01');
  const newer = chain(makeEx({ id: 'new', name: '新动作' }), ['easy'], '2025-02-01');
  const two = buildStrengthCards([
    { exercise: makeEx({ id: 'old', name: '旧动作' }), baseKg: 7.5, override: older, manualKg: null },
    { exercise: makeEx({ id: 'new', name: '新动作' }), baseKg: 7.5, override: newer, manualKg: null },
  ]);
  assert.equal(two[0].name, '新动作');
});

/* ================= 3. 里程碑 ================= */

const MILE_INPUT: MilestoneInput = {
  history: hist([
    // 10 节课：01-02 起隔天
    ['2025-01-02', 'A', 300],
    ['2025-01-04', 'B', 300],
    ['2025-01-06', 'C', 300],
    ['2025-01-08', 'D', 300],
    ['2025-01-10', 'A', 300],
    ['2025-01-12', 'B', 300],
    ['2025-01-14', 'C', 300],
    ['2025-01-16', 'D', 300],
    ['2025-01-18', 'A', 300],
    ['2025-01-20', 'B', 300],
    ['2025-01-21', 'REST', 50], // REST 不计课数
  ]),
  streak: 3,
  minisByDate: { '2025-01-03': ['hip'] },
  overrides: [{ exerciseId: 'test-ex', override: chain(DUMBBELL_75, ['easy', 'easy', 'easy'], '2025-01-05') }],
  today: '2025-01-22',
};

ok('课数里程碑：1/5/10 达成且达成日正确，25 未达成带进度', () => {
  const ms = buildMilestones(MILE_INPUT);
  const byId = new Map(ms.map((m) => [m.id, m]));
  assert.equal(ms.length, 9);
  assert.equal(byId.get('lesson-1')?.reached, true);
  assert.equal(byId.get('lesson-1')?.reachedDate, '2025-01-02');
  assert.equal(byId.get('lesson-5')?.reachedDate, '2025-01-10');
  assert.equal(byId.get('lesson-10')?.reachedDate, '2025-01-20');
  assert.equal(byId.get('lesson-10')?.celebrate, '第 10 课达成，你不是新手了');
  const l25 = byId.get('lesson-25');
  assert.equal(l25?.reached, false);
  assert.deepEqual(l25?.progress, { current: 10, target: 25 });
});

ok('streak 里程碑：训练日隔天不断档（REST+小练续上），7 天达成日 = 第 7 天', () => {
  // 01-02 到 01-08 每天都有记录（含 REST 01-06? 这里用训练+小练混排）
  const input: MilestoneInput = {
    history: hist([
      ['2025-02-01', 'A', 1],
      ['2025-02-02', 'REST', 1],
      ['2025-02-04', 'B', 1],
      ['2025-02-05', 'C', 1],
      ['2025-02-06', 'D', 1],
      ['2025-02-07', 'A', 1],
    ]),
    streak: 7,
    minisByDate: { '2025-02-03': ['hip'] }, // 补齐 02-03 → 02-01..02-07 连续 7 天
    overrides: [],
    today: '2025-02-07',
  };
  const ms = buildMilestones(input);
  const byId = new Map(ms.map((m) => [m.id, m]));
  assert.equal(byId.get('streak-7')?.reached, true);
  assert.equal(byId.get('streak-7')?.reachedDate, '2025-02-07');
  assert.equal(byId.get('streak-30')?.reached, false);
  assert.deepEqual(byId.get('streak-30')?.progress, { current: 7, target: 30 });
});

ok('streak 兜底：history 缺日期但 cycle.streak 达标 → 也算达成（达成日=today）', () => {
  const ms = buildMilestones({ history: [], streak: 7, minisByDate: {}, overrides: [], today: '2025-03-01' });
  const s7 = ms.find((m) => m.id === 'streak-7');
  assert.equal(s7?.reached, true);
  assert.equal(s7?.reachedDate, '2025-03-01');
});

ok('首次小练 / 首次连续 3 次加重：判定与达成日', () => {
  const ms = buildMilestones(MILE_INPUT);
  const byId = new Map(ms.map((m) => [m.id, m]));
  assert.equal(byId.get('first-mini')?.reached, true);
  assert.equal(byId.get('first-mini')?.reachedDate, '2025-01-03');
  assert.equal(byId.get('triple-up')?.reached, true);
  assert.equal(byId.get('triple-up')?.reachedDate, '2025-01-07'); // 第 3 次 easy 那天
  // 未达成情形
  const none = buildMilestones({ history: [], streak: 0, minisByDate: {}, overrides: [], today: '2025-01-01' });
  assert.equal(none.find((m) => m.id === 'first-mini')?.reached, false);
  assert.equal(none.find((m) => m.id === 'triple-up')?.reached, false);
  // 中间断过不算：easy easy ok easy easy easy → 第 3 个连击在最后一组
  const broken = buildMilestones({
    history: [],
    streak: 0,
    minisByDate: {},
    overrides: [{ exerciseId: 'x', override: chain(DUMBBELL_75, ['easy', 'easy', 'ok', 'easy', 'easy', 'easy'], '2025-01-01') }],
    today: '2025-01-10',
  });
  assert.equal(broken.find((m) => m.id === 'triple-up')?.reachedDate, '2025-01-06');
});

ok('longestRun + buildGrowthData 组装', () => {
  assert.equal(longestRun(['2025-01-01', '2025-01-02', '2025-01-04']), 2);
  assert.equal(longestRun([]), 0);
  const cycle: CycleState = { nextWorkoutIndex: 1, streak: 5, lastTrainingDate: '2025-01-20', lastRestDate: null, history: MILE_INPUT.history };
  const data = buildGrowthData(cycle, { '2025-01-03': ['hip'] }, [], '2025-01-22');
  assert.equal(data.calendar.history.length, MILE_INPUT.history.length);
  assert.equal(data.milestones.streak, 5);
  assert.equal(data.calendar.minisByDate['2025-01-03'][0], 'hip');
});

console.log(`\n${passed} 项全部通过`);
