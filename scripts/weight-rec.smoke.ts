/**
 * weight-rec.ts 纯函数 Node 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx tsx scripts/weight-rec.smoke.ts
 * 覆盖：
 *   - 男 80kg Lv.1（锚点画像）：所有动作 base/kg/step 与旧写死推荐完全一致（原样）
 *   - 女 55kg Lv.1：明显下调（pull 20→8.75、哑铃 5→2.5、推类再 ×0.85、杠铃撞空杆下限）
 *   - Lv.3 上调（×1.3）；profile=null 不缩放（老用户无感升级）
 *   - 自重 / 无 kg 数值（"阻力3-5档"）原样返回、stepKg=0
 *   - 辅助类重量反向缩放（越大越轻松）；体重系数 clamp [0.6,1.4]；目标微调 cut/bulk
 *   - 文案替换：锚点段（含 "15-20kg" 范围）换成分档值，其余口语保留
 */
import assert from 'node:assert/strict';
import { bodyWeightFactor, levelFactor, recommendLoad, totalFactor } from '../src/lib/weight-rec';
import type { Exercise, UserProfile } from '../src/lib/types';
import exercisesJson from '../src/data/exercises.json';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const EXS = exercisesJson as Exercise[];
const byId = (id: string): Exercise => {
  const ex = EXS.find((e) => e.id === id);
  if (!ex) throw new Error(`动作不存在: ${id}`);
  return ex;
};

function makeProfile(over: Partial<UserProfile>): UserProfile {
  return {
    gender: 'male',
    age: 25,
    heightCm: 181,
    weightKg: 80,
    experience: 'newbie',
    injuries: ['none'],
    leftRightDiff: 'none',
    fatAreas: [],
    dietHabits: [],
    venues: ['gym'],
    goal: 'recomp',
    completedAt: 0,
    ...over,
  };
}

const MALE80 = makeProfile({});
const FEMALE55 = makeProfile({ gender: 'female', weightKg: 55 });

/* ================= 锚点画像：男 80kg Lv.1 完全原样 ================= */

ok('男 80kg Lv.1（recomp）：base 原字符串、kg=锚点、step 沿用旧规则', () => {
  const cases: [string, number, number][] = [
    ['lat-pulldown', 20, 5],
    ['db-curl', 5, 2],
    ['bb-bench-press', 20, 2.5],
    ['db-lateral-raise', 2.5, 2],
    ['leg-press', 20, 5],
    ['smith-bench-press', 15, 5],
    ['assisted-pullup-machine', 50, 5],
  ];
  for (const [id, kg, step] of cases) {
    const ex = byId(id);
    const r = recommendLoad(ex, MALE80, 1);
    assert.equal(r.base, ex.suggestedWeight, `${id} base 应原样`);
    assert.equal(r.kg, kg, `${id} kg`);
    assert.equal(r.stepKg, step, `${id} step`);
  }
});

ok('profile=null（老用户/未填问卷）：Lv.1 完全不缩放', () => {
  const ex = byId('lat-pulldown');
  const r = recommendLoad(ex, null, 1);
  assert.equal(r.base, ex.suggestedWeight);
  assert.equal(r.kg, 20);
  assert.equal(r.stepKg, 5);
});

/* ================= 女性下调 ================= */

ok('女 55kg Lv.1：pull/legs ×0.45 明显下调，文案锚点换成分档值', () => {
  const ex = byId('lat-pulldown');
  const r = recommendLoad(ex, FEMALE55, 1);
  assert.equal(r.kg, 8.75); // 20×0.6×0.75=9 → 取整 8.75
  assert.equal(r.base, '插片8.75kg开始找感觉，能标准做12个下次就加一片（5kg）');
  assert.equal(r.stepKg, 2.5); // 小重量细步进（原 5 减半）
});

ok('女 55kg Lv.1：上肢推类额外 ×0.85（哑铃卧推 7.5→2.5）', () => {
  const r = recommendLoad(byId('db-bench-press'), FEMALE55, 1);
  assert.equal(r.kg, 2.5); // 7.5×0.3825≈2.87 → 取整 2.5
  assert.equal(r.stepKg, 2); // 哑铃保持 ±2
  assert.ok(r.base.startsWith('每只手2.5kg开始'), r.base);
});

ok('女 55kg Lv.1：杠铃卧推撞空杆下限 20kg（文案原样）', () => {
  const ex = byId('bb-bench-press');
  const r = recommendLoad(ex, FEMALE55, 1);
  assert.equal(r.kg, 20); // 7.65 取下限空杆
  assert.equal(r.base, ex.suggestedWeight);
  assert.equal(r.stepKg, 2.5);
});

ok('女 55kg Lv.1：小哑铃侧平举撞 2kg 下限', () => {
  const r = recommendLoad(byId('db-lateral-raise'), FEMALE55, 1);
  assert.equal(r.kg, 2); // 0.96 → 哑铃下限 2
  assert.ok(r.base.startsWith('每只手2kg开始'), r.base);
});

ok('女 55kg Lv.1：器械腿举 20→8.75，不低于器械下限 5kg', () => {
  const r = recommendLoad(byId('leg-press'), FEMALE55, 1);
  assert.equal(r.kg, 8.75);
  assert.equal(r.stepKg, 2.5);
  assert.ok(r.kg >= 5);
});

/* ================= 等级 / 体重 / 目标系数 ================= */

ok('Lv.3 上调 ×1.3（男 80kg：20→26.25、5→6.25 取整到 1.25）', () => {
  assert.equal(recommendLoad(byId('lat-pulldown'), MALE80, 3).kg, 26.25);
  assert.equal(recommendLoad(byId('db-curl'), MALE80, 3).kg, 6.25);
  assert.equal(levelFactor(1), 1);
  assert.equal(levelFactor(2), 1.15);
  assert.equal(levelFactor(3), 1.3);
});

ok('体重系数：80→1，55→0.75，40→0.6（clamp），130→1.4（clamp）', () => {
  assert.equal(bodyWeightFactor(80), 1);
  assert.equal(bodyWeightFactor(55), 0.75);
  assert.equal(bodyWeightFactor(40), 0.6);
  assert.equal(bodyWeightFactor(30), 0.6);
  assert.equal(bodyWeightFactor(130), 1.4);
  assert.equal(bodyWeightFactor(100), 1.2);
});

ok('目标微调：cut ×0.95（20→18.75）· bulk ×1.05（20→21.25）· recomp 不动', () => {
  const ex = byId('lat-pulldown');
  assert.equal(recommendLoad(ex, makeProfile({ goal: 'cut' }), 1).kg, 18.75);
  assert.equal(recommendLoad(ex, makeProfile({ goal: 'bulk' }), 1).kg, 21.25);
  assert.equal(recommendLoad(ex, makeProfile({ goal: 'recomp' }), 1).kg, 20);
  // 系数合成校验：女 55kg push cut Lv.1 = 0.6×0.85×0.75×0.95
  const f = totalFactor(byId('db-bench-press'), makeProfile({ gender: 'female', weightKg: 55, goal: 'cut' }), 1);
  assert.ok(Math.abs(f - 0.6 * 0.85 * 0.75 * 0.95) < 1e-9, String(f));
});

/* ================= 特例：自重 / 不可解析 / 辅助反向 ================= */

ok('自重类原样返回：base 不动、kg=null、stepKg=0', () => {
  for (const id of ['push-up', 'plank', 'pull-up', 'air-squat']) {
    const ex = byId(id);
    const r = recommendLoad(ex, FEMALE55, 2);
    assert.equal(r.base, ex.suggestedWeight, `${id} base`);
    assert.equal(r.kg, null, `${id} kg`);
    assert.equal(r.stepKg, 0, `${id} step`);
  }
});

ok('无 kg 数值（"阻力3-5档"、"中等阻力起步"）原样返回、stepKg=0', () => {
  for (const id of ['treadmill-incline-walk', 'elliptical', 'band-row']) {
    const ex = byId(id);
    const r = recommendLoad(ex, FEMALE55, 3);
    assert.equal(r.base, ex.suggestedWeight, `${id} base`);
    assert.equal(r.kg, null, `${id} kg`);
    assert.equal(r.stepKg, 0, `${id} step`);
  }
});

ok('辅助类重量反向缩放：女 55kg 辅助引体 50→77.5（越重越轻松）', () => {
  const ex = byId('assisted-pullup-machine');
  const r = recommendLoad(ex, FEMALE55, 1);
  assert.equal(r.kg, 77.5); // 50×(2-0.45)
  assert.ok(r.kg > 50);
  assert.ok(r.base.startsWith('辅助77.5kg起步'), r.base);
  // 锚点画像反向系数=1 → 原样
  assert.equal(recommendLoad(ex, MALE80, 1).base, ex.suggestedWeight);
});

/* ================= 取整与范围文案 ================= */

ok('推荐值均为 1.25kg 倍数（或器械物理下限 2/5/10/20）', () => {
  const floors = new Set([2, 5, 10, 20]);
  for (const ex of EXS) {
    for (const p of [MALE80, FEMALE55, makeProfile({ gender: 'female', weightKg: 48, goal: 'cut' }), makeProfile({ weightKg: 95, goal: 'bulk' })]) {
      for (const lv of [1, 2, 3] as const) {
        const r = recommendLoad(ex, p, lv);
        if (r.kg === null) continue;
        const isPlate = Math.abs(r.kg / 1.25 - Math.round(r.kg / 1.25)) < 1e-9;
        assert.ok(isPlate || floors.has(r.kg), `${ex.id} → ${r.kg}kg 非 1.25 倍数也非下限`);
      }
    }
  }
});

ok('范围文案整段替换："插片15-20kg起步" → 女 55kg "插片7.5kg起步"', () => {
  const r = recommendLoad(byId('chest-press-machine'), FEMALE55, 1);
  assert.equal(r.kg, 7.5); // 20×0.3825=7.65 → 7.5
  assert.ok(r.base.startsWith('插片7.5kg起步'), r.base);
  assert.ok(!r.base.includes('15-20'), r.base);
});

console.log(`\n${passed} 项全部通过`);
