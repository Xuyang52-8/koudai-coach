/**
 * 我的器械（ownedEquipment）+ 器械过滤层 Node 冒烟测试（非单测框架，直接断言跑一遍）：
 *   npx tsx scripts/equipment.smoke.ts
 * 覆盖：
 *   - 目录完整性：equipment.json 分组/预设 id 合法；preset-xu-gym 21 件；exercises.json 补的
 *     equipmentId 全部能在目录里找到；名字映射表不指空
 *   - preset-xu-gym 模板：4 节课 gym 解析零"缺器械动作"（铁律：不推荐没有的器械），
 *     坐姿划船机/蝴蝶机这类模板外器械被替代链换掉
 *   - 只选哑铃：卧推架动作（bb-bench-press）被替换；哑铃+凳时替代链先命中哑铃卧推
 *   - 全不行降级：owned=[] 时课表仍有得练（全走居家/自重变体），且零缺器械动作
 *   - ownedEquipment=undefined：行为与现状完全一致（gym 变体原样，零过滤）
 * 注：Node 下无 localStorage，store 读取走 try/catch 回落默认 → 能力等级恒 Lv.1（原样），
 *     断言看到的就是数据基准。
 */
import assert from 'node:assert/strict';
import exercisesJson from '../src/data/exercises.json';
import {
  ALL_EQUIPMENT_IDS,
  allExercisesAvailable,
  EQUIPMENT_BY_ID,
  EQUIPMENT_GROUPS,
  EQUIPMENT_NAME_TO_ID,
  EQUIPMENT_PRESETS,
  exerciseAvailableWith,
  getEquipmentPreset,
  toEquipmentIdList,
} from '../src/lib/equipment';
import type { Exercise, UserProfile, Workout } from '../src/lib/types';
import { program, resolveExercisesForProfile } from '../src/lib/utils-workout';

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const builtinExercises = exercisesJson as Exercise[];
const ids = (list: Exercise[]): string[] => list.map((e) => e.id);

function makeProfile(ownedEquipment?: string[], experience: UserProfile['experience'] = 'newbie'): UserProfile {
  return {
    gender: 'male',
    age: 20,
    heightCm: 181,
    weightKg: 81.5,
    experience,
    injuries: [],
    leftRightDiff: 'none',
    fatAreas: [],
    dietHabits: [],
    venues: ['gym'],
    goal: 'cut',
    completedAt: Date.now(),
    ...(ownedEquipment ? { ownedEquipment } : {}),
  };
}

/** 测试课：gym 变体只有杠铃卧推（卧推架+杠铃），热身跑步机 */
const WK_BENCH: Workout = {
  id: 'T',
  title: '测试课',
  subtitle: '测试',
  focus: '',
  warmupExerciseId: 'treadmill-incline-walk',
  exerciseIds: ['bb-bench-press'],
  variants: { gym: ['bb-bench-press'], home: ['push-up'], bodyweight: ['push-up'] },
  warmupVariants: { gym: 'treadmill-incline-walk', home: 'jumping-jack' },
  coachNote: '',
};

/* ================= 目录完整性 ================= */

ok('目录：4 分组 27 件器械，id 全局唯一', () => {
  assert.equal(EQUIPMENT_GROUPS.length, 4);
  assert.equal(ALL_EQUIPMENT_IDS.length, 27);
  assert.equal(new Set(ALL_EQUIPMENT_IDS).size, 27);
  assert.equal(EQUIPMENT_BY_ID.size, 27);
});

ok('目录：预设合法（全件套 27 / 我的健身房模板 21 / 宿舍简易 2），引用的 id 都存在', () => {
  const full = getEquipmentPreset('preset-full-gym');
  const xu = getEquipmentPreset('preset-xu-gym');
  const dorm = getEquipmentPreset('preset-dorm');
  assert.ok(full && xu && dorm);
  assert.equal(full.equipmentIds.length, 27);
  assert.equal(xu.equipmentIds.length, 21);
  assert.deepEqual([...dorm.equipmentIds].sort(), ['dumbbell', 'flat-bench']);
  for (const p of EQUIPMENT_PRESETS) {
    for (const id of p.equipmentIds) assert.ok(EQUIPMENT_BY_ID.has(id), `${p.id} 引用了不存在的器械 ${id}`);
  }
  // 我的健身房模板：哑铃凳/腹肌凳/上斜凳/卧推架/深蹲架/史密斯/直奥杆/EZ曲杆/哈克/高位下拉/
  // 龙门架/髋外展/辅助引体/腿弯举/腿举/坐姿推肩/坐姿推胸/跑步/椭圆/爬楼 全在
  for (const id of [
    'dumbbell', 'flat-bench', 'ab-bench', 'incline-bench', 'bench-press-rack', 'squat-rack',
    'smith-machine', 'barbell', 'ez-bar', 'hack-squat', 'lat-pulldown', 'cable-crossover',
    'hip-abductor', 'assisted-pullup', 'leg-curl', 'leg-press', 'shoulder-press', 'chest-press',
    'treadmill', 'elliptical', 'stair-climber',
  ]) {
    assert.ok(xu.equipmentIds.includes(id), `模板缺 ${id}`);
  }
});

ok('映射：exercises.json 补的 equipmentId 全部指向目录内器械', () => {
  const tagged = builtinExercises.filter((e) => e.equipmentId);
  assert.ok(tagged.length >= 30, `补标数量异常：${tagged.length}`);
  for (const e of tagged) {
    for (const id of toEquipmentIdList(e.equipmentId)) {
      assert.ok(EQUIPMENT_BY_ID.has(id), `${e.id} 指向不存在的器械 ${id}`);
    }
  }
});

ok('映射：名字映射表不指空，且兜底判定生效（写不清=都有）', () => {
  for (const [name, mapped] of Object.entries(EQUIPMENT_NAME_TO_ID)) {
    for (const id of toEquipmentIdList(mapped)) assert.ok(EQUIPMENT_BY_ID.has(id), `${name} 映射到不存在的 ${id}`);
  }
  const smith = builtinExercises.find((e) => e.id === 'smith-squat');
  assert.ok(smith);
  assert.equal(exerciseAvailableWith(smith, []), false); // 空清单 → 史密斯深蹲不可用
  const fakeNoTag = { ...smith, equipmentId: undefined }; // 没补标的旧数据：按名字"史密斯机"兜底
  assert.equal(exerciseAvailableWith(fakeNoTag, []), false);
  const plank = builtinExercises.find((e) => e.id === 'plank');
  assert.ok(plank);
  assert.equal(exerciseAvailableWith(plank, []), true); // 自重类写不清 → 保守放行
});

/* ================= preset-xu-gym：4 节课零缺器械动作 ================= */

ok('preset-xu-gym：4 节课 gym 解析零缺器械动作（铁律）', () => {
  const xu = getEquipmentPreset('preset-xu-gym');
  assert.ok(xu);
  const profile = makeProfile(xu.equipmentIds);
  for (const w of program.workouts) {
    const r = resolveExercisesForProfile(w, profile, 'gym');
    assert.ok(r.exercises.length >= 4, `${w.id} 课动作数异常：${r.exercises.length}`);
    assert.ok(
      allExercisesAvailable(r.exercises, xu.equipmentIds),
      `${w.id} 课排出缺器械动作：${ids(r.exercises).join(',')}`,
    );
    if (r.warmup) {
      assert.ok(exerciseAvailableWith(r.warmup, xu.equipmentIds), `${w.id} 课热身缺器械：${r.warmup.id}`);
    }
  }
});

ok('preset-xu-gym：模板外器械被替代链换掉（坐姿划船机→弹力带划船，蝴蝶机→弹力带推胸）', () => {
  const xu = getEquipmentPreset('preset-xu-gym');
  assert.ok(xu);
  const profile = makeProfile(xu.equipmentIds);
  const a = resolveExercisesForProfile(program.workouts[0], profile, 'gym');
  assert.ok(!ids(a.exercises).includes('seated-row'), '坐姿划船机不该出现');
  assert.ok(ids(a.exercises).includes('band-row'), '应换成弹力带划船');
  const c = resolveExercisesForProfile(program.workouts[2], profile, 'gym');
  assert.ok(!ids(c.exercises).includes('pec-deck'), '蝴蝶机不该出现');
  assert.ok(ids(c.exercises).includes('band-chest-press'), '应换成弹力带推胸');
  // 模板内的器械原样保留
  assert.ok(ids(a.exercises).includes('lat-pulldown'), '高位下拉应保留');
  assert.ok(ids(c.exercises).includes('rope-pushdown'), '龙门架绳索下压应保留');
});

/* ================= 替代链逐级验器械 ================= */

ok('只选哑铃：卧推架动作被替换（杠铃卧推→俯卧撑），热身也换掉', () => {
  const profile = makeProfile(['dumbbell']);
  const r = resolveExercisesForProfile(WK_BENCH, profile, 'gym');
  assert.ok(!ids(r.exercises).includes('bb-bench-press'), '卧推架动作不该出现');
  // 替代链：db-bench-press 需要哑铃+平板凳 → 凳缺，跳过 → push-up 自重可做
  assert.deepEqual(ids(r.exercises), ['push-up']);
  assert.ok(allExercisesAvailable(r.exercises, ['dumbbell']));
  // 热身跑步机也没有 → 走替代链到户外慢跑（无器械要求）
  assert.equal(r.warmup?.id, 'outdoor-run');
});

ok('替代动作也验器械：哑铃+平板凳齐全 → 替代链先命中哑铃卧推', () => {
  const profile = makeProfile(['dumbbell', 'flat-bench']);
  const r = resolveExercisesForProfile(WK_BENCH, profile, 'gym');
  assert.deepEqual(ids(r.exercises), ['db-bench-press']); // 第一替代器械齐全，直接命中
});

ok('全不行再降级：owned=[] 时课表仍有得练（居家/自重变体兜底），零缺器械动作', () => {
  const profile = makeProfile([]);
  for (const w of program.workouts) {
    const r = resolveExercisesForProfile(w, profile, 'gym');
    assert.ok(r.exercises.length >= 4, `${w.id} 课动作数异常：${r.exercises.length}`);
    assert.ok(allExercisesAvailable(r.exercises, []), `${w.id} 课排出缺器械动作：${ids(r.exercises).join(',')}`);
  }
  // B 课第 4 位保加利亚分腿蹲（要凳）：替代链为空 → 降级 bodyweight 同位变体单腿臀桥
  const b = resolveExercisesForProfile(program.workouts[1], profile, 'gym');
  assert.equal(b.exercises[3]?.id, 'single-leg-glute-bridge');
});

/* ================= 老用户无感 ================= */

ok('ownedEquipment=undefined：行为与现状一致（gym 变体原样，零过滤）', () => {
  /* v1.5：新手保护期只影响 experience=newbie 且 Lv.1 的用户；老用户（非 newbie）无感 */
  const profile = makeProfile(undefined, 'intermediate');
  for (const w of program.workouts) {
    const r = resolveExercisesForProfile(w, profile, 'gym');
    assert.deepEqual(ids(r.exercises), w.variants?.gym ?? w.exerciseIds, `${w.id} 课被意外过滤`);
    assert.equal(r.warmup?.id, w.warmupVariants?.gym ?? w.warmupExerciseId);
  }
});

ok('全选（preset-full-gym）：与 gym 变体原样一致，零替换', () => {
  const full = getEquipmentPreset('preset-full-gym');
  assert.ok(full);
  /* v1.5：newbie 会触发新手保护期替换，这里验证"非新手零替换" */
  const profile = makeProfile(full.equipmentIds, 'intermediate');
  for (const w of program.workouts) {
    const r = resolveExercisesForProfile(w, profile, 'gym');
    assert.deepEqual(ids(r.exercises), w.variants?.gym ?? w.exerciseIds, `${w.id} 课被意外替换`);
  }
});

/* ================= v1.5 新手保护期 ================= */

ok('新手保护期：newbie Lv.1 高门槛拉类自动降辅助引体机（有器械时）', () => {
  const xu = getEquipmentPreset('preset-xu-gym');
  assert.ok(xu);
  const profile = makeProfile(xu.equipmentIds, 'newbie');
  const a = resolveExercisesForProfile(program.workouts[0], profile, 'gym');
  assert.ok(!ids(a.exercises).includes('dead-hang'), 'A 课不该出现自重吊杠');
  assert.ok(ids(a.exercises).includes('assisted-pullup-machine'), 'A 课应换成辅助引体机');
  const d = resolveExercisesForProfile(program.workouts[3], profile, 'gym');
  assert.ok(!ids(d.exercises).includes('band-assisted-pullup'), 'D 课不该出现弹力带引体');
  assert.ok(ids(d.exercises).includes('assisted-pullup-machine'), 'D 课应换成辅助引体机');
});

ok('新手保护期：无辅助引体机时不硬换（走原替代链）', () => {
  const profile = makeProfile(['dumbbell'], 'newbie');
  const a = resolveExercisesForProfile(program.workouts[0], profile, 'gym');
  assert.ok(!ids(a.exercises).includes('assisted-pullup-machine'), '没器械不该换出辅助引体机');
  assert.ok(a.exercises.length >= 4, 'A 课动作数异常');
});

console.log(`\n${passed} 项全部通过`);
