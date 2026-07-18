/**
 * 练后总结页（/summary）—— 实现规格：/mnt/agents/output/design/summary.md
 * 职责：打勾仪式 + 三个大数字（约消耗 / 用时 / streak）+ 蛋白粉提醒（30 分钟时效）
 *   + 肌酸打卡 + 今日热量迷你进度 + 下一课预告 + 回首页。
 * 数据：Workout 页收尾写入的 workoutExtra 快照；当天重复进入可补打卡（补剂实时读写）。
 * 首次进入调用 completeWorkout 推进循环（extra.counted 防重复 +  store 侧幂等双保险）。
 */
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import nutritionJson from '../data/nutrition.json';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import EmptyState from '../components/EmptyState';
import { CheckDraw, useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ProgressBar from '../components/ProgressBar';
import SectionLabel from '../components/SectionLabel';
import { useWorkoutExtra } from '../components/workout/extra';
import {
  completeWorkout,
  getSupplements,
  shiftDate,
  todayStr,
  toggleSupplement,
  useCycle,
  useDietEntries,
  useSupplements,
} from '../lib/store';
import { speak } from '../lib/tts';
import type { NutritionData } from '../lib/types';
import { getNextWorkoutInfo, LESSON_SHORT_NAMES, program, resolveWorkout } from '../lib/utils-workout';

const nutrition = nutritionJson as NutritionData;

/* ================= 滚动数字（600ms，stagger） ================= */

function RollingNumber({ target, delay, size = 40 }: { target: number; delay: number; size?: number }): JSX.Element {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(count, target, reduce ? { duration: 0.1 } : { duration: 0.6, delay, ease: 'easeOut' });
    return () => controls.stop();
  }, [target, delay, count, reduce]);
  return (
    <motion.span className="num" style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}>
      {rounded}
    </motion.span>
  );
}

/* ================= 肌酸连续天数 ================= */

function creatineStreak(todayDone: boolean): number {
  let count = 0;
  const today = todayStr();
  for (let i = todayDone ? 0 : 1; i < 30; i++) {
    if (getSupplements(shiftDate(today, -i)).creatine) count += 1;
    else break;
  }
  return count;
}

/* ================= 页面 ================= */

interface SummaryData {
  workoutId: string;
  lessonNumber: number;
  subtitle: string;
  journeyNum: string;
  kcal: number;
  minutes: number | null;
  doneSets: number;
  totalSets: number;
  skipped: string[];
  finishedAt: number | null;
}

export default function Summary(): JSX.Element {
  const navigate = useNavigate();
  const [cycle] = useCycle();
  const [extra, setExtra] = useWorkoutExtra();
  const [supps] = useSupplements();
  const [dietEntries] = useDietEntries();
  const feedback = useFeedback();
  const reduce = useReducedMotion();

  /* ---------- 数据源：优先今天的快照；否则当天 history 兜底（重复进入） ---------- */
  const data: SummaryData | null = useMemo(() => {
    const today = todayStr();
    if (extra && extra.date === today) {
      const w = program.workouts.find((x) => x.id === extra.workoutId);
      const exCount = w ? w.exerciseIds.length : 5;
      return {
        workoutId: extra.workoutId,
        lessonNumber: extra.lessonNumber,
        subtitle: extra.workoutSubtitle,
        journeyNum: String(exCount + 2).padStart(2, '0'),
        kcal: extra.kcal,
        minutes: Math.max(1, Math.round((extra.finishedAt - extra.startedAt) / 60000)),
        doneSets: extra.doneSets,
        totalSets: extra.totalSets,
        skipped: extra.skipped,
        finishedAt: extra.finishedAt,
      };
    }
    const entry = [...cycle.history].reverse().find((h) => h.date === today && h.workoutId !== 'REST');
    if (entry) {
      const idx = program.workouts.findIndex((x) => x.id === entry.workoutId);
      if (idx >= 0) {
        const w = program.workouts[idx];
        const { exercises } = resolveWorkout(w);
        const total = exercises.reduce((s, e) => s + Math.max(1, e.sets), 0);
        return {
          workoutId: w.id,
          lessonNumber: idx + 1,
          subtitle: w.subtitle,
          journeyNum: String(w.exerciseIds.length + 2).padStart(2, '0'),
          kcal: entry.kcal,
          minutes: null,
          doneSets: total,
          totalSets: total,
          skipped: [],
          finishedAt: null,
        };
      }
    }
    return null;
  }, [extra, cycle]);

  /* ---------- 推进循环（仅首次，counted 防重复） ---------- */
  useEffect(() => {
    if (extra && extra.date === todayStr() && !extra.counted) {
      completeWorkout(extra.workoutId, extra.kcal);
      setExtra((prev) => (prev ? { ...prev, counted: true } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra?.date, extra?.counted]);

  /* ---------- 入场仪式：震动 + 一句鼓励 ---------- */
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!data || greetedRef.current) return;
    greetedRef.current = true;
    vibrate([60, 40, 60]);
    speak('漂亮，今天这节课拿下了，记得喝蛋白粉');
  }, [data]);

  /* ---------- 蛋白粉状态 ---------- */
  const [wheyShake, setWheyShake] = useState(0);
  const [wheyTime, setWheyTime] = useState<string | null>(null);
  const wheyDone = supps.whey;
  const elapsedSinceFinish = data?.finishedAt ? (Date.now() - data.finishedAt) / 60000 : null;
  const wheyLate = !wheyDone && elapsedSinceFinish !== null && elapsedSinceFinish > 30;
  const wheyFaded = !wheyDone && elapsedSinceFinish !== null && elapsedSinceFinish > 60;

  const toggleWhey = () => {
    const next = toggleSupplement('whey');
    vibrate(30);
    if (next) {
      setWheyShake((n) => n + 1);
      const d = new Date();
      setWheyTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
  };

  /* ---------- 肌酸状态 ---------- */
  const creatineDone = supps.creatine;
  const cStreak = creatineStreak(creatineDone);

  /* ---------- 今日饮食进度 ---------- */
  const eatenKcal = dietEntries.reduce((s, e) => s + e.kcal, 0);
  const eatenProtein = dietEntries.reduce((s, e) => s + e.protein, 0);

  /* ---------- 下一课预告（completeWorkout 后 cycle 已推进） ---------- */
  const nextInfo = getNextWorkoutInfo(cycle);

  if (!data) {
    return (
      <div style={{ paddingTop: 20 }}>
        <EmptyState text="今天还没练出总结。练完一节课，这里给你记功。" actionLabel="去预习今天的课" onAction={() => navigate('/preview')} />
        <div style={{ marginTop: 14 }}>
          <GhostButton onClick={() => navigate('/')}>回首页</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 12 }}>
      {feedback.host}

      {/* 头部标签行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 }}>
        <SectionLabel index={data.journeyNum}>总结</SectionLabel>
        <span className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          第 {data.lessonNumber} 课
        </span>
      </div>

      {/* 打勾仪式区 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 24 }}>
        <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div
            aria-hidden
            initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0.9 }}
            animate={reduce ? { opacity: 0 } : { scale: 1.15, opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.6, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'var(--accent-dim)' }}
          />
          <CheckDraw size={88} />
        </div>
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.1 : 0.3, delay: 0.4 }}
          className="font-display text-1"
          style={{ margin: '18px 0 0', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          这节课，拿下
        </motion.h1>
        <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13 }}>
          第 {data.lessonNumber} 课 · {data.subtitle} 完成
        </p>
      </div>

      {/* §1 三个大数字 */}
      <section style={{ display: 'flex', marginTop: 28, borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0' }}>
          <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 14 }}>约</span>
            <RollingNumber target={data.kcal} delay={0} />
          </span>
          <span className="text-2" style={{ fontSize: 13 }}>
            估算消耗 · 大卡
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0', borderLeft: '1px solid var(--line)' }}>
          <span className="text-1">
            {data.minutes !== null ? (
              <RollingNumber target={data.minutes} delay={0.12} />
            ) : (
              <span className="num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
                —
              </span>
            )}
          </span>
          <span className="text-2" style={{ fontSize: 13 }}>
            实际用时 · 分钟
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0', borderLeft: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <RollingNumber target={cycle.streak} delay={0.24} />
            <span style={{ fontSize: 14 }}>天</span>
          </span>
          <span className="text-2" style={{ fontSize: 13 }}>
            连续打卡
          </span>
        </div>
      </section>
      <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13 }}>
        完成 {data.doneSets}/{data.totalSets} 组 · 消耗是估算值，看个大概就行
      </p>
      {data.skipped.length > 0 ? (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--warn)' }}>跳过了：{data.skipped.join('、')}，下节课再收拾它。</p>
      ) : null}

      {/* §2 蛋白粉提醒（有时效） */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: wheyFaded ? 0.55 : 1, y: 0 }}
        transition={{ duration: reduce ? 0.1 : 0.3, ease: 'easeOut' }}
        style={{
          marginTop: 28,
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          padding: '16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <motion.img
          key={wheyShake}
          src="./illust-shaker.svg"
          alt="摇摇杯线稿图"
          animate={wheyShake > 0 && !reduce ? { rotate: [0, -8, 8, 0] } : undefined}
          transition={{ duration: 0.3 }}
          style={{ width: 72, height: 72, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-1" style={{ margin: 0, fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
            现在喝蛋白粉：1 勺 + 水/牛奶
          </p>
          <p className="text-2" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            {wheyDone ? '喝得好，肌肉今晚有料修。' : wheyLate ? '越快越好，现在去。' : '练后 30 分钟内喝效果最好，别等回家。'}
          </p>
        </div>
        {wheyDone ? (
          <PrimaryButton fullWidth={false} size="md" icon={<Icon name="check" size={18} />} onClick={toggleWhey} style={{ minWidth: 118 }}>
            已喝{wheyTime ? ` · ${wheyTime}` : ''}
          </PrimaryButton>
        ) : (
          <GhostButton
            fullWidth={false}
            size="md"
            onClick={toggleWhey}
            style={wheyLate ? { minWidth: 118, borderColor: 'var(--warn)', color: 'var(--warn)' } : { minWidth: 118 }}
          >
            喝了 ✓
          </GhostButton>
        )}
      </motion.section>

      {/* §3 肌酸打卡 */}
      <section
        style={{
          borderBottom: '1px solid var(--line)',
          minHeight: 64,
          padding: '12px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: 'var(--accent)', display: 'inline-flex', flexShrink: 0 }}>
          <Icon name="droplet" size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-1" style={{ margin: 0, fontSize: 17, fontWeight: 500, lineHeight: 1.5 }}>
            肌酸今天喝了没？3-5g，随时都行
          </p>
          {creatineDone ? (
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--accent)' }}>
              今天已补{cStreak > 0 ? ` · 连续 ${cStreak} 天` : ''}
            </p>
          ) : null}
        </div>
        {creatineDone ? (
          <PrimaryButton fullWidth={false} size="md" icon={<Icon name="check" size={18} />} onClick={() => { toggleSupplement('creatine'); vibrate(30); }} style={{ minWidth: 104 }}>
            喝了
          </PrimaryButton>
        ) : (
          <GhostButton fullWidth={false} size="md" onClick={() => { toggleSupplement('creatine'); vibrate(30); }} style={{ minWidth: 104 }}>
            没喝
          </GhostButton>
        )}
      </section>

      {/* §4 今日热量进度（迷你，引流 /diet） */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.1 : 0.3, delay: 0.5 }}
        style={{ marginTop: 28, cursor: 'pointer' }}
        onClick={() => navigate('/diet')}
        role="button"
        aria-label="去饮食页记一笔"
      >
        <SectionLabel index="顺带">今天吃的</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <ProgressBar value={eatenKcal} max={nutrition.profile.targetKcal} unit="大卡" />
        </div>
        <p className="text-2" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          约 {Math.round(eatenKcal)} / {nutrition.profile.targetKcal} 大卡 · 蛋白质约 {Math.round(eatenProtein)}g / {nutrition.profile.proteinG}g
          {eatenProtein < nutrition.profile.proteinG ? ' — 晚上这顿多来点蛋白质' : ''}
        </p>
        <p className="text-3" style={{ margin: '4px 0 0', fontSize: 13 }}>
          点这里去记一笔 →
        </p>
      </motion.section>

      {/* §5 下节课预告 */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.1 : 0.4, delay: 0.7 }}
        style={{ marginTop: 32, textAlign: 'center' }}
      >
        <p className="text-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          明天休息，去游个泳或者散散步。
        </p>
        <p className="text-2" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.7 }}>
          后天见：第 {nextInfo.lessonNumber} 课 · {LESSON_SHORT_NAMES[nextInfo.index]}（{nextInfo.workout.subtitle}）
        </p>
      </motion.section>

      {/* 底部 CTA */}
      <div style={{ marginTop: 28 }}>
        <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={() => navigate('/')}>
          回到今日
        </PrimaryButton>
      </div>
    </div>
  );
}
