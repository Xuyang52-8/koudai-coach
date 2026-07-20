/**
 * 日常小练 minis 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx esbuild scripts/minis.smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/minis.smoke.mjs
 *   node /tmp/minis.smoke.mjs
 * 覆盖：
 * - 数据合法性：包 id 唯一、audience 合法、所有阶段秒数 > 0、开头有"准备"阶段
 * - minutes 字段与阶段总秒数换算一致（含 rounds 展开）
 * - 动作阶段必须引用 exerciseId（存在于 exercises.json）或内联 custom 六要素简版
 * - 凯格尔 levels 结构：levels[0] 与默认 phases 深等（防漂移）、等级 id 唯一
 * - 男女过滤：男不显女版、女不显男版、未填两版都显示、all 包恒在
 * - extras 置顶排序：选中置顶（保相对序）、'none'/空 extras 原序
 * - expandTimeline：rounds 展开步数、counter 文案
 */
import assert from 'node:assert/strict';
import exercisesJson from '../src/data/exercises.json';
import {
  MINI_PACKS,
  expandTimeline,
  filterMinisForProfile,
  miniDisplayName,
  sortMinisForProfile,
  totalSeconds,
} from '../src/components/mini/minis';
import type { Exercise, MiniPack, MiniPhaseGroup, UserProfile } from '../src/lib/types';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const exerciseIds = new Set((exercisesJson as Exercise[]).map((e) => e.id));

/** 结构性阶段（非动作，不需要 exerciseId/custom） */
const STRUCTURAL = new Set(['准备', '休息', '转换', '换边', '放松呼吸', '收紧', '放松', '慢收']);

function eachPhase(pack: MiniPack, fn: (g: MiniPhaseGroup, p: MiniPhaseGroup['phases'][number], where: string) => void): void {
  pack.phases.forEach((g, gi) => g.phases.forEach((p) => fn(g, p, `phases[${gi}]`)));
  pack.levels?.forEach((lv) => lv.phases.forEach((g, gi) => g.phases.forEach((p) => fn(g, p, `${lv.id}.phases[${gi}]`))));
}

function makeProfile(over: Partial<UserProfile>): UserProfile {
  return {
    gender: 'male',
    age: 20,
    heightCm: 175,
    weightKg: 70,
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

const byId = (id: string): MiniPack => {
  const p = MINI_PACKS.find((x) => x.id === id);
  assert.ok(p, `缺少小练包 ${id}`);
  return p as MiniPack;
};

/* ---------- 1. 五包齐全、id 唯一、audience 合法 ---------- */
ok('五个小练包齐全且 id 唯一', () => {
  assert.equal(MINI_PACKS.length, 5);
  const ids = new Set(MINI_PACKS.map((p) => p.id));
  assert.equal(ids.size, 5);
  for (const id of ['kegel-m', 'kegel-f', 'hip', 'legs', 'posture']) assert.ok(ids.has(id), `缺 ${id}`);
  for (const p of MINI_PACKS) assert.ok(['male', 'female', 'all'].includes(p.audience), `${p.id} audience 非法`);
});

/* ---------- 2. 阶段秒数 > 0（含 levels）、开头有"准备" ---------- */
ok('所有阶段秒数 > 0 且每包以"准备"开头', () => {
  for (const pack of MINI_PACKS) {
    eachPhase(pack, (_g, p, where) => {
      assert.ok(Number.isFinite(p.secs) && p.secs > 0, `${pack.id} ${where} ${p.name} secs=${p.secs}`);
      assert.ok(p.name.length > 0 && p.cue.length > 0, `${pack.id} ${where} 缺 name/cue`);
    });
    assert.equal(pack.phases[0]?.phases[0]?.name, '准备', `${pack.id} 开头缺"准备"阶段`);
  }
});

/* ---------- 3. minutes 与总秒数一致 ---------- */
ok('minutes 字段与阶段总秒数换算一致', () => {
  for (const pack of MINI_PACKS) {
    const expected = Math.max(1, Math.round(totalSeconds(pack) / 60));
    assert.equal(pack.minutes, expected, `${pack.id}: 声明 ${pack.minutes} 分钟，实际 ${totalSeconds(pack)} 秒`);
  }
});

/* ---------- 4. 动作阶段：exerciseId 存在或内联 custom ---------- */
ok('exerciseId 引用存在，新动作内联 custom 六要素简版', () => {
  for (const pack of MINI_PACKS) {
    eachPhase(pack, (_g, p, where) => {
      if (p.exerciseId) {
        assert.ok(exerciseIds.has(p.exerciseId), `${pack.id} ${where} ${p.name} 引用不存在的 exerciseId=${p.exerciseId}`);
      } else if (!STRUCTURAL.has(p.name)) {
        assert.ok(p.custom, `${pack.id} ${where} ${p.name} 既无 exerciseId 也无 custom`);
        assert.ok(p.custom && p.custom.muscle.length > 0 && p.custom.steps.length > 0 && p.custom.mantra.length > 0,
          `${pack.id} ${where} ${p.name} custom 六要素简版不完整`);
      }
    });
  }
});

/* ---------- 5. 凯格尔 levels：Lv.1 与默认 phases 深等、id 唯一 ---------- */
ok('凯格尔 levels 结构合法（Lv.1 = 默认 phases）', () => {
  for (const id of ['kegel-m', 'kegel-f']) {
    const pack = byId(id);
    assert.ok(pack.levels && pack.levels.length >= 3, `${id} 应至少预留 3 个等级`);
    const lvIds = new Set(pack.levels!.map((l) => l.id));
    assert.equal(lvIds.size, pack.levels!.length, `${id} 等级 id 重复`);
    assert.deepEqual(pack.levels![0].phases, pack.phases, `${id} Lv.1 与默认 phases 不一致`);
  }
});

/* ---------- 6. 男女过滤逻辑 ---------- */
ok('凯格尔按性别过滤：男不显女版、女不显男版、未填都显示', () => {
  const male = filterMinisForProfile(makeProfile({ gender: 'male' })).map((p) => p.id);
  assert.ok(male.includes('kegel-m') && !male.includes('kegel-f'), '男版过滤错');
  const female = filterMinisForProfile(makeProfile({ gender: 'female' })).map((p) => p.id);
  assert.ok(female.includes('kegel-f') && !female.includes('kegel-m'), '女版过滤错');
  const anon = filterMinisForProfile(null).map((p) => p.id);
  assert.ok(anon.includes('kegel-m') && anon.includes('kegel-f'), '未填性别应两版都显示');
  for (const list of [male, female, anon]) {
    assert.ok(list.includes('hip') && list.includes('legs') && list.includes('posture'), 'all 包应恒在');
  }
  assert.equal(male.length, 4, '男：1 凯格尔 + 3 通用');
  assert.equal(female.length, 4, '女：1 凯格尔 + 3 通用');
  assert.equal(anon.length, 5, '未填：2 凯格尔版本 + 3 通用');
});

/* ---------- 7. 通用名：已知性别只显示一版时用"盆底肌训练" ---------- */
ok('miniDisplayName：有性别用通用名，未填保留全名', () => {
  const km = byId('kegel-m');
  assert.equal(miniDisplayName(km, makeProfile({ gender: 'male' })), '盆底肌训练');
  assert.equal(miniDisplayName(km, null), '盆底肌训练（男）');
  assert.equal(miniDisplayName(byId('hip'), null), '髋部灵活');
});

/* ---------- 8. extras 置顶排序 ---------- */
ok('问卷 extras 选中的包置顶（保相对序），none/空 extras 原序', () => {
  const all = filterMinisForProfile(makeProfile({ gender: 'male' }));
  const sorted = sortMinisForProfile(all, makeProfile({ gender: 'male', extras: ['legs', 'pelvic'] }));
  assert.deepEqual(sorted.slice(0, 2).map((p) => p.id), ['kegel-m', 'legs']);
  assert.deepEqual(sorted.slice(2).map((p) => p.id), ['hip', 'posture']);
  const withNone = sortMinisForProfile(all, makeProfile({ gender: 'male', extras: ['none'] }));
  assert.deepEqual(withNone.map((p) => p.id), all.map((p) => p.id));
  const noExtras = sortMinisForProfile(all, makeProfile({ gender: 'male' }));
  assert.deepEqual(noExtras.map((p) => p.id), all.map((p) => p.id));
});

/* ---------- 9. expandTimeline：rounds 展开与 counter 文案 ---------- */
ok('expandTimeline 正确展开 rounds 并生成轮次文案', () => {
  const kegel = byId('kegel-m');
  const steps = expandTimeline(kegel.phases);
  assert.equal(steps.length, 1 + 20 + 1); // 准备 + 收放×10 + 放松呼吸
  assert.equal(steps[1].counter, '第 1/10 轮');
  assert.equal(steps[20].counter, '第 10/10 轮');
  assert.equal(steps[0].counter, '第 1/3 部分');
  assert.equal(steps[steps.length - 1].phase.name, '放松呼吸');
  assert.ok(steps.every((s, i) => s.index === i && s.total === steps.length));

  const legs = byId('legs');
  const legSteps = expandTimeline(legs.phases);
  assert.equal(legSteps.length, 1 + 10 * 2); // 准备 + 两轮各 10 步
  assert.equal(legSteps[1].counter, '第 1/2 轮');
  assert.equal(legSteps[11].counter, '第 2/2 轮');
});

console.log(`\nminis.smoke: ${passed} 项全部通过`);
