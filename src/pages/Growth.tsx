/**
 * 成长页（/growth）—— 「让用户看见自己在变强」
 * 三个板块（数据聚合全部走 lib/growth.ts 纯函数）：
 *   (01) 训练日历：当月格子历，训练=绿点 / 小练=黄点 / 休息打卡=灰点，点格子弹当天摘要，可翻月
 *   (02) 力量成长：RPE 覆盖记录回放出的重量/次数轨迹 + 人话点评
 *   (03) 里程碑：9 枚预设里程碑墙，新达成时页顶弹庆祝卡
 * 接线说明：路由 /growth 由主代理挂（本文件默认导出即可）；TabBar 主代理统一加。
 */
import { AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import CalendarBoard from '../components/growth/CalendarBoard';
import CelebrationCard from '../components/growth/CelebrationCard';
import MilestoneBoard from '../components/growth/MilestoneBoard';
import StrengthBoard from '../components/growth/StrengthBoard';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import { weightSpec } from '../components/workout/weight';
import type { ExerciseOverride } from '../lib/adjust';
import { buildGrowthData, buildMilestones, buildMonthCalendar, buildStrengthCards, shiftMonth } from '../lib/growth';
import type { StrengthSourceEntry } from '../lib/growth';
import { getAllExerciseOverrides, getMinisCompleted, todayStr, useCycle, useStoreKey } from '../lib/store';
import { getExerciseById } from '../lib/utils-workout';

/** 页面 Props：当前为空（即插即用约定，路由直接挂载即可） */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GrowthProps {}

/* ================= store 扫描（不新增 store 键，页面侧收集） ================= */

const MINIS_PREFIX = 'koudai-coach:minis:';

/** 扫 localStorage 全部 minis:{date} 键 → { 日期: 完成的小练包 id 列表 }（空列表不收） */
function collectMinisByDate(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(MINIS_PREFIX)) continue;
      const date = k.slice(MINIS_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const ids = getMinisCompleted(date);
      if (ids.length > 0) out[date] = ids;
    }
  } catch {
    // localStorage 不可用：返回已收集部分
  }
  return out;
}

/** 力量线输入：RPE 覆盖（exoverride:*）∪ 手动重量（weights 键），解析动作与画像基准 */
function collectStrengthEntries(
  overrides: { exerciseId: string; override: ExerciseOverride }[],
  weights: Record<string, number>,
): StrengthSourceEntry[] {
  const byId = new Map(overrides.map((o) => [o.exerciseId, o.override]));
  const ids = new Set<string>([...byId.keys(), ...Object.keys(weights)]);
  const out: StrengthSourceEntry[] = [];
  for (const id of ids) {
    const exercise = getExerciseById(id);
    if (!exercise) continue; // 动作已被删（自建动作移除）：不出卡
    out.push({
      exercise,
      baseKg: weightSpec(exercise).kg,
      override: byId.get(id) ?? null,
      manualKg: weights[id] ?? null,
    });
  }
  return out;
}

/* ================= 页面 ================= */

export default function Growth(props: GrowthProps): JSX.Element {
  void props; // 空 Props 占位（即插即用约定，当前无入参）
  const [cycle] = useCycle();
  const [weights] = useStoreKey<Record<string, number>>('weights', {});
  const [seenMilestones, setSeenMilestones] = useStoreKey<string[]>('growth:seenMilestones', []);

  const today = todayStr();
  const [{ year, month }, setYm] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const canNext = year * 12 + month < new Date().getFullYear() * 12 + (new Date().getMonth() + 1);

  /* ---------- 数据聚合（cycle 变化=新打卡/新 RPE 后重算，作失效信号；进页即重挂载） ---------- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const minisByDate = useMemo(() => collectMinisByDate(), [cycle]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overrides = useMemo(() => getAllExerciseOverrides(), [cycle]);
  const data = useMemo(() => buildGrowthData(cycle, minisByDate, overrides, today), [cycle, minisByDate, overrides, today]);
  const cal = useMemo(() => buildMonthCalendar(year, month, data.calendar, today), [year, month, data, today]);
  const strengthCards = useMemo(() => buildStrengthCards(collectStrengthEntries(overrides, weights)), [overrides, weights]);
  const milestones = useMemo(() => buildMilestones(data.milestones), [data]);

  /* ---------- 新达成庆祝：已达成但未见过的里程碑，最新的一枚 ---------- */
  const celebrating = useMemo(() => {
    const fresh = milestones.filter((m) => m.reached && !seenMilestones.includes(m.id));
    fresh.sort((a, b) => (b.reachedDate ?? '').localeCompare(a.reachedDate ?? ''));
    return fresh[0] ?? null;
  }, [milestones, seenMilestones]);

  /** 收下庆祝：把当前全部已达成里程碑标记为已见（不连弹） */
  const dismissCelebration = () => {
    const reachedIds = milestones.filter((m) => m.reached).map((m) => m.id);
    setSeenMilestones([...new Set([...seenMilestones, ...reachedIds])]);
  };

  return (
    <div style={{ paddingBottom: 12 }}>
      <ScreenHeader label="口袋私教 · POCKET COACH" title="你在变强" />

      {/* 新里程碑庆祝卡（顶部弹出） */}
      <AnimatePresence>
        {celebrating ? <CelebrationCard key={celebrating.id} milestone={celebrating} onDismiss={dismissCelebration} /> : null}
      </AnimatePresence>

      {/* (01) 训练日历 */}
      <section>
        <SectionLabel index="01">训练日历</SectionLabel>
        <CalendarBoard
          cal={cal}
          input={data.calendar}
          canNext={canNext}
          onPrevMonth={() => setYm((s) => shiftMonth(s.year, s.month, -1))}
          onNextMonth={() => setYm((s) => shiftMonth(s.year, s.month, 1))}
        />
      </section>

      {/* (02) 力量成长线 */}
      <section style={{ marginTop: 32 }}>
        <SectionLabel index="02">力量成长</SectionLabel>
        <StrengthBoard cards={strengthCards} />
      </section>

      {/* (03) 里程碑墙 */}
      <section style={{ marginTop: 32 }}>
        <SectionLabel index="03">里程碑</SectionLabel>
        <MilestoneBoard milestones={milestones} />
      </section>
    </div>
  );
}
