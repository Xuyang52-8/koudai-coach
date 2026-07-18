/**
 * 四场地覆盖率审计（数据校验脚本，非单测框架）：
 *   npx tsx scripts/venue-coverage.ts
 *
 * 背景：用户在首页把今日场地切成"居家/户外/自重"时，App 曾推荐健身房器械动作——
 * 根因是 program.json 的场地变体里引用了 venues 字段不含目标场地的动作（或变体缺失，
 * 解析凑合回落到默认 gym 动作列表）。本脚本守住这条线：
 *
 * 对 program.json 每节课 × 四种场地（gym/home/outdoor/bodyweight）：
 *   1) 走真实解析链路 resolveExercisesForProfile(workout, null, venue)，
 *      等价于"用户把今日场地切成 X"（含 variants 缺省回落 exerciseIds、
 *      warmupVariants 缺省回落 warmupExerciseId 的全部兜底逻辑）；
 *   2) 核对解析出的热身 + 每个正式动作的 venues 字段必须包含所选场地
 *      （自重/居家等替代动作只要 venues 标对了就视为合格）；
 *   3) 结构性问题单独点名：场地变体缺失、变体引用了不存在的动作 id、
 *      动作缺 venues 字段。
 *
 * 退出码：0 = CLEAN（零缺口）；1 = 存在缺口，报告里逐条列出。
 * Node 下无 localStorage，getCycle() 走 try/catch 回落空 history → 能力等级恒 Lv.1，
 * 解析出的动作 id 与生产一致（能力引擎只调 reps/sets，不换动作）。
 */
import exercisesJson from '../src/data/exercises.json';
import { program, resolveExercisesForProfile } from '../src/lib/utils-workout';
import { VENUE_LABELS } from '../src/lib/profile';
import type { Exercise, Venue } from '../src/lib/types';

const VENUES: Venue[] = ['gym', 'home', 'outdoor', 'bodyweight'];
const exerciseMap = new Map<string, Exercise>((exercisesJson as Exercise[]).map((e) => [e.id, e]));

interface Gap {
  workoutId: string;
  venue: Venue;
  slot: 'warmup' | 'main' | 'structure';
  detail: string;
}

const gaps: Gap[] = [];

/** 该节课在该场地"应该"用的动作 id 列表（与解析链路的取数口径一致） */
function expectedIds(workoutId: string, venue: Venue): { ids: string[]; variantMissing: boolean } {
  const w = program.workouts.find((x) => x.id === workoutId)!;
  const variant = w.variants?.[venue];
  return { ids: variant ?? w.exerciseIds, variantMissing: !variant };
}

console.log('========== 口袋私教 · 四场地覆盖率审计 ==========\n');
console.log(`动作库共 ${exerciseMap.size} 个动作，课程 ${program.workouts.length} 节，场地 ${VENUES.length} 种\n`);

/* ---------- 第 0 步：数据卫生——所有被引用的动作必须存在且标了 venues ---------- */
console.log('—— 数据卫生检查（引用完整性 / venues 标注）——');
let hygieneIssues = 0;
for (const w of program.workouts) {
  const referenced = new Set<string>([w.warmupExerciseId, ...w.exerciseIds]);
  for (const v of VENUES) {
    for (const id of w.variants?.[v] ?? []) referenced.add(id);
    const wid = w.warmupVariants?.[v];
    if (wid) referenced.add(wid);
  }
  for (const id of referenced) {
    const ex = exerciseMap.get(id);
    if (!ex) {
      gaps.push({ workoutId: w.id, venue: 'gym', slot: 'structure', detail: `引用了不存在的动作 id：${id}` });
      hygieneIssues += 1;
    } else if (!ex.venues || ex.venues.length === 0) {
      gaps.push({ workoutId: w.id, venue: 'gym', slot: 'structure', detail: `动作 ${id}（${ex.name}）缺 venues 字段` });
      hygieneIssues += 1;
    }
  }
}
console.log(hygieneIssues === 0 ? '  全部通过：无失效引用、venues 字段齐全\n' : `  发现 ${hygieneIssues} 处（详见缺口清单）\n`);

/* ---------- 第 1 步：逐课逐场地走真实解析链路 ---------- */
for (const w of program.workouts) {
  console.log(`===== 课 ${w.id} ${w.title}（${w.subtitle}）=====`);
  for (const venue of VENUES) {
    const { warmup, exercises } = resolveExercisesForProfile(w, null, venue);
    const { ids, variantMissing } = expectedIds(w.id, venue);
    const label = VENUE_LABELS[venue];

    if (variantMissing) {
      gaps.push({
        workoutId: w.id,
        venue,
        slot: 'structure',
        detail: `缺 ${label} 场地变体，解析回落到默认 exerciseIds（gym 配置）`,
      });
    }
    const warmupExpected = w.warmupVariants?.[venue] ?? w.warmupExerciseId;
    if (!w.warmupVariants?.[venue]) {
      console.log(`  [${venue}] ⚠ 缺 ${label} 热身变体，回落默认热身 ${warmupExpected}`);
    }

    // 解析数量核对：变体里引用了不存在的 id 会被静默过滤
    if (exercises.length !== ids.length) {
      const resolvedIds = new Set(exercises.map((e) => e.id));
      const lost = ids.filter((id) => !resolvedIds.has(id));
      gaps.push({
        workoutId: w.id,
        venue,
        slot: 'structure',
        detail: `${label} 变体有 ${lost.length} 个动作未解析出（id 不存在？）：${lost.join(', ')}`,
      });
    }

    // 热身场地核对
    const warmupOk = warmup !== null && (warmup.venues ?? []).includes(venue);
    if (!warmupOk) {
      gaps.push({
        workoutId: w.id,
        venue,
        slot: 'warmup',
        detail: `选${label} → 热身落到 ${warmup ? `${warmup.id}（${warmup.name}，venues=${JSON.stringify(warmup.venues)}）` : 'null（id 不存在）'}`,
      });
    }

    // 正式动作场地核对
    const lines: string[] = [];
    for (const e of exercises) {
      const ok = (e.venues ?? []).includes(venue);
      if (!ok) {
        gaps.push({
          workoutId: w.id,
          venue,
          slot: 'main',
          detail: `选${label} → 正式动作落到 ${e.id}（${e.name}，venues=${JSON.stringify(e.venues)}）`,
        });
      }
      lines.push(`      ${ok ? '✓' : '✗'} ${e.id}（${e.name}）`);
    }
    console.log(
      `  [${venue}] ${label} 热身=${warmup ? `${warmup.id}${warmupOk ? '✓' : '✗'}` : 'null✗'} 正式 ${exercises.length} 个${
        variantMissing ? '（无变体，回落默认列表）' : ''
      }`,
    );
    for (const l of lines) console.log(l);
  }
  console.log('');
}

/* ---------- 第 2 步：被引用动作的场地覆盖一览 ---------- */
console.log('—— 被课程引用的动作 · 场地覆盖一览（●=可做 ○=不可做）——');
const referencedIds = new Set<string>();
for (const w of program.workouts) {
  referencedIds.add(w.warmupExerciseId);
  for (const id of w.exerciseIds) referencedIds.add(id);
  for (const v of VENUES) {
    for (const id of w.variants?.[v] ?? []) referencedIds.add(id);
    const wid = w.warmupVariants?.[v];
    if (wid) referencedIds.add(wid);
  }
}
console.log(`  ${'动作 id'.padEnd(26)} gym  home out  body`);
for (const id of [...referencedIds].sort()) {
  const ex = exerciseMap.get(id);
  if (!ex) {
    console.log(`  ${id.padEnd(26)} (不存在)`);
    continue;
  }
  const marks = VENUES.map((v) => ((ex.venues ?? []).includes(v) ? ' ●  ' : ' ○  ')).join(' ');
  console.log(`  ${id.padEnd(26)} ${marks}`);
}
console.log('');

/* ---------- 汇总 ---------- */
console.log('================== 审计汇总 ==================');
if (gaps.length === 0) {
  console.log(`CLEAN：${program.workouts.length} 节课 × ${VENUES.length} 种场地，热身+正式动作全部落在匹配场地的动作上，零缺口。`);
  process.exit(0);
} else {
  console.log(`发现 ${gaps.length} 个缺口：`);
  gaps.forEach((g, i) => {
    console.log(`  ${i + 1}. [课${g.workoutId} / ${VENUE_LABELS[g.venue]} / ${g.slot}] ${g.detail}`);
  });
  console.log('\n修复方向：缺变体补变体；动作 venues 不含目标场地时，优先新增合格的居家/户外/自重替代动作并在变体中引用。');
  process.exit(1);
}
