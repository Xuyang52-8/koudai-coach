/**
 * 今日页（首页 /）：训练日态 / 休息日态双状态
 * 实现规格：/mnt/agents/output/design/home.md
 * - ScreenHeader：label「口袋私教 · POCKET COACH」+ display「今天练什么」+ streak 徽章 + TTSToggle
 * - §1 今日训练卡 / 休息日卡（CRT 纹理 + 径向微光 + 3px 顶线动画）
 * - §2 循环进度（①拉 ②腿+核心 ③推 ④弱项 ◌休，绝不出现星期）
 * - §3 出门前 checklist（仅训练日，每日 00:00 自动重置——按日期键存储）
 * - §4 快捷入口 2×2（预习/饮食/肌酸打卡/动作库）
 */
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import nutritionJson from '../data/nutrition.json';
import BottomSheet from '../components/BottomSheet';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import Tag, { WarnTag } from '../components/Tag';
import TTSToggle from '../components/TTSToggle';
import {
  getRecentCheckins,
  toggleChecklistItem,
  toggleSupplement,
  useChecklist,
  useCycle,
  useProfile,
  useSchedule,
  useSupplements,
} from '../lib/store';
import { bestVenue } from '../lib/profile';
import { speak } from '../lib/tts';
import type { ScheduleMode, Supplement, TodayRestState, TodayWorkoutState } from '../lib/types';
import { getTimeHint, getTodayState, LESSON_SHORT_NAMES } from '../lib/utils-workout';

const supplements = nutritionJson.supplements as Supplement[];

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** 每节课的 3 个提示 Tag（按课程内容取） */
const LESSON_TAGS: Record<string, string[]> = {
  A: ['引体追赶计划', '单臂左手先', '练完背酸两天'],
  B: ['练完腿软', '左腿先上', '空腹别练'],
  C: ['哑铃为主安全', '左臂先做', '轻重量起步'],
  D: ['全身燃脂', '左臂优先补强', '冲击小强度够'],
};

const CHECKLIST_ITEMS = ['水杯装满', '蛋白粉和摇摇杯带了', '耳机带了', '换洗衣服'];

/* ================= streak 徽章 ================= */

function StreakBadge({ streak, onClick }: { streak: number; onClick: () => void }): JSX.Element {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(count, streak, reduce ? { duration: 0.1 } : { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [streak, count, reduce]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`连续打卡 ${streak} 天，查看打卡日历`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'var(--accent-dim)',
        border: 'none',
        borderRadius: 999,
        padding: '6px 12px',
        cursor: 'pointer',
        color: 'var(--accent)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <motion.span
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={reduce ? { duration: 0.1 } : { delay: 0.3, type: 'spring', stiffness: 300, damping: 15 }}
        style={{ display: 'inline-flex' }}
      >
        <Icon name="flame" size={18} />
      </motion.span>
      <motion.span className="num" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>
        {rounded}
      </motion.span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>天</span>
    </button>
  );
}

/* ================= §1 卡片外壳（顶线动画 + CRT + 微光） ================= */

function TodayCardShell({ tone, children }: { tone: 'accent' | 'warn'; children: ReactNode }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { duration: 0.35, ease: 'easeOut' }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-raised)',
        border: '1px solid var(--line-strong)',
        borderRadius: 4,
      }}
    >
      {/* 顶部 3px 实线：width 0→100%（500ms 延迟 150ms）；休息日态 200ms 后 accent→warn */}
      <motion.div
        initial={{ width: '0%' }}
        animate={{
          width: '100%',
          backgroundColor: tone === 'warn' ? '#FFB224' : '#3FE1B1',
        }}
        transition={{
          width: reduce ? { duration: 0.1 } : { duration: 0.5, delay: 0.15, ease: 'easeOut' },
          backgroundColor: reduce ? { duration: 0.1 } : { duration: 0.3, delay: tone === 'warn' ? 0.2 : 0 },
        }}
        style={{ height: 3 }}
      />
      {/* 卡内顶部装饰层：CRT 扫描线 + accent 径向微光（opacity 克制） */}
      <div aria-hidden className="crt" style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 130, opacity: 0.9, pointerEvents: 'none' }} />
      <div
        aria-hidden
        className="glow-accent"
        style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 340, height: 220, pointerEvents: 'none' }}
      />
      <div style={{ position: 'relative', padding: 18 }}>{children}</div>
    </motion.section>
  );
}

/* ================= §2 循环进度 ================= */

type NodeState = 'done' | 'current' | 'todo';

function CycleNode({ state, label, index, delay }: { state: NodeState; label: string; index: number; delay: number }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduce ? { duration: 0.1 } : { delay, type: 'spring', stiffness: 380, damping: 20 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 52, flexShrink: 0 }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 15,
          border: state === 'current' ? '2px solid var(--accent)' : state === 'done' ? 'none' : '1px solid var(--line-strong)',
          background: state === 'done' ? 'var(--accent)' : state === 'current' ? 'var(--accent-dim)' : 'transparent',
          color: state === 'done' ? '#060607' : state === 'current' ? 'var(--accent)' : 'var(--text-3)',
          boxShadow: state === 'current' ? '0 0 0 6px var(--accent-dim)' : 'none',
        }}
      >
        {state === 'done' ? <Icon name="check" size={16} strokeWidth={2.5} /> : <span className="num">{index}</span>}
      </div>
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          color: state === 'current' ? 'var(--accent)' : state === 'done' ? 'var(--text-2)' : 'var(--text-3)',
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}

/** 排期模式对应的循环说明文案 */
const MODE_CAPTION: Record<ScheduleMode, string> = {
  '1on1off': '练一天休一天，跟着走就行，别管星期几。',
  '2on1off': '练两天休一天，跟着走就行，别管星期几。',
  weekdays: '按你定的星期练，其他日子好好休息。',
};

function CycleProgress({
  currentLesson,
  isRest,
  mode,
  venueTag,
}: {
  currentLesson: number;
  isRest: boolean;
  mode: ScheduleMode;
  venueTag: string | null;
}): JSX.Element {
  const reduce = useReducedMotion();
  // currentLesson：下一节课下标 0-3。训练日它是"当前课"；休息日"休"是当前。
  const nodes: { label: string; state: NodeState; num: number }[] = LESSON_SHORT_NAMES.map((label, i) => ({
    label,
    num: i + 1,
    state: isRest ? (i < currentLesson ? 'done' : 'todo') : i < currentLesson ? 'done' : i === currentLesson ? 'current' : 'todo',
  }));
  nodes.push({ label: '休', num: 5, state: isRest ? 'current' : 'todo' });

  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="循环">你的节奏</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 16 }}>
        {nodes.map((node, i) => (
          <div key={node.label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < nodes.length - 1 ? 1 : undefined }}>
            <CycleNode state={node.state} label={node.label} index={node.num} delay={i * 0.06} />
            {i < nodes.length - 1 ? (
              <div style={{ flex: 1, height: 1, background: 'var(--line)', marginTop: 18, position: 'relative', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={reduce ? { duration: 0.1 } : { delay: 0.15 + i * 0.2, duration: 0.2, ease: 'easeOut' }}
                  style={{ height: '100%', background: i < currentLesson ? 'var(--accent)' : 'var(--line-strong)' }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        {MODE_CAPTION[mode]}
      </p>
      {venueTag ? (
        <div style={{ marginTop: 10 }}>
          <Tag>{venueTag}</Tag>
        </div>
      ) : null}
    </section>
  );
}

/* ================= §3 出门前 checklist ================= */

function CheckRow({ label, checked, onToggle, delay }: { label: string; checked: boolean; onToggle: () => void; delay: number }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { delay, duration: 0.3, ease: EASE_OUT }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        minHeight: 48,
        padding: '8px 4px',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* 44×44 热区内的勾选框 */}
      <span
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: checked ? '2px solid var(--accent)' : '1px solid var(--line-strong)',
            background: checked ? 'var(--accent-dim)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 150ms, background 150ms',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={reduce ? { duration: 0.1 } : { duration: 0.2, ease: 'easeOut' }}
            />
          </svg>
        </span>
      </span>
      <span
        style={{
          fontSize: 16,
          color: checked ? 'var(--text-3)' : 'var(--text-1)',
          textDecoration: checked ? 'line-through' : 'none',
          textDecorationColor: 'var(--text-3)',
          transition: 'color 150ms',
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}

function DepartureChecklist(): JSX.Element {
  const [checklist] = useChecklist();
  const doneCount = CHECKLIST_ITEMS.filter((_, i) => checklist[String(i)]).length;
  const allDone = doneCount === CHECKLIST_ITEMS.length;
  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="出门前">检查一下</SectionLabel>
      {allDone ? (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--accent)', lineHeight: 1.5 }}
        >
          齐了，出发。
        </motion.p>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {CHECKLIST_ITEMS.map((label, i) => (
          <CheckRow
            key={label}
            label={label}
            checked={Boolean(checklist[String(i)])}
            delay={i * 0.05}
            onToggle={() => {
              vibrate(15);
              toggleChecklistItem(String(i));
            }}
          />
        ))}
      </div>
    </section>
  );
}

/* ================= §4 快捷入口 ================= */

function QuickEntries({ onSupplement }: { onSupplement: () => void }): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const entries: { icon: JSX.Element; label: string; onClick: () => void }[] = [
    { icon: <Icon name="book" size={20} />, label: '预习动作', onClick: () => navigate('/preview') },
    { icon: <Icon name="plus" size={20} />, label: '记一笔饮食', onClick: () => navigate('/diet') },
    { icon: <Icon name="droplet" size={20} />, label: '肌酸打卡', onClick: onSupplement },
    { icon: <Icon name="dumbbell" size={20} />, label: '动作库', onClick: () => navigate('/library') },
  ];
  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="快捷">顺手就办了</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        {entries.map((entry, i) => (
          <motion.div
            key={entry.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.1 } : { delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
          >
            <GhostButton size="sm" icon={entry.icon} onClick={entry.onClick} style={{ minHeight: 72, justifyContent: 'flex-start', padding: '0 14px' }}>
              {entry.label}
            </GhostButton>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= 补剂打卡 Sheet ================= */

function SupplementSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [state] = useSupplements();
  const { celebrate, host } = useFeedback();
  return (
    <BottomSheet open={open} onClose={onClose} title="补剂打卡">
      {host}
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
        {supplements.map((sup) => {
          const checked = sup.id === 'whey' ? state.whey : sup.id === 'creatine' ? state.creatine : false;
          return (
            <button
              key={sup.id}
              type="button"
              onClick={() => {
                const nowOn = toggleSupplement(sup.id === 'whey' ? 'whey' : 'creatine');
                if (nowOn) celebrate(sup.id === 'whey' ? '蛋白粉已打卡，记得 30 分钟内喝' : '肌酸已打卡，白天多喝水');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                minHeight: 56,
                padding: '12px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
                textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: checked ? 'none' : '1px solid var(--line-strong)',
                  background: checked ? 'var(--accent)' : 'transparent',
                  color: checked ? '#060607' : 'var(--text-3)',
                  transition: 'background 150ms',
                }}
              >
                {checked ? <Icon name="check" size={18} strokeWidth={2.5} /> : <Icon name="droplet" size={18} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>
                  {sup.name} · {sup.dose}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{sup.timing}</span>
              </span>
              <span style={{ fontSize: 13, color: checked ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                {checked ? '已打卡' : '点一下打卡'}
              </span>
            </button>
          );
        })}
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {supplements.find((s) => s.id === 'creatine')?.note ?? ''}
        </p>
      </div>
    </BottomSheet>
  );
}

/* ================= streak 打卡日历 Sheet（近 14 天圆点，无图表） ================= */

function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const days = getRecentCheckins(14);
  return (
    <BottomSheet open={open} onClose={onClose} title="近 14 天打卡">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, padding: '8px 0 4px' }}>
        {days.map((d) => (
          <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  d.kind === 'workout' ? 'var(--accent)' : d.kind === 'rest' ? 'var(--warn)' : 'transparent',
                border: d.checked ? 'none' : '1px solid var(--line-strong)',
                color: d.checked ? '#060607' : 'var(--text-3)',
              }}
            >
              {d.checked ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}>{d.date.slice(5).replace('-', '/')}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 4px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent)' }}>绿点</span> 是训练日，<span style={{ color: 'var(--warn)' }}>黄点</span>{' '}
        是休息日恢复打卡——休息日也算坚持。
      </p>
    </BottomSheet>
  );
}

/* ================= §1 训练日卡 ================= */

function WorkoutCard({ state, firstLaunch }: { state: TodayWorkoutState; firstLaunch: boolean }): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { workout, lessonNumber, exercises, estimatedMinutes } = state;
  const tags = LESSON_TAGS[workout.id] ?? ['跟着练就行'];
  return (
    <TodayCardShell tone="accent">
      <div
        className="font-display font-semibold uppercase text-3"
        style={{ fontSize: 13, letterSpacing: '0.14em' }}
      >
        第 {lessonNumber} 课 / 共 4 课循环
      </div>
      <h2
        className="font-display text-1"
        style={{ margin: '8px 0 0', fontSize: 40, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}
      >
        {workout.subtitle}
      </h2>
      <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        {exercises.length} 个动作 · 约 {estimatedMinutes} 分钟 · 含 5 分钟热身
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
        {state.doneToday ? <WarnTag>今天已打卡</WarnTag> : null}
      </div>
      {firstLaunch ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--accent)', lineHeight: 1.5 }}>
          第一节课从空杆和轻重量开始，别慌。
        </p>
      ) : null}
      <p className="text-3" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        {getTimeHint()}
      </p>
      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={reduce ? { duration: 0.1 } : { delay: 0.4, type: 'spring', stiffness: 400, damping: 18 }}
        style={{ marginTop: 16 }}
      >
        <PrimaryButton
          size="lg"
          icon={<Icon name="play" size={20} />}
          onClick={() => {
            vibrate(30);
            navigate('/workout');
          }}
        >
          开始训练
        </PrimaryButton>
      </motion.div>
      <div style={{ marginTop: 12 }}>
        <GhostButton size="sm" right={<Icon name="arrow-right" size={16} />} onClick={() => navigate('/preview')}>
          先去路上预习动作
        </GhostButton>
      </div>
    </TodayCardShell>
  );
}

/* ================= §1 休息日卡 ================= */

function RestCard({
  state,
  modeLabel,
  scheduleNote,
  onSwitchToWorkout,
}: {
  state: TodayRestState;
  /** 排期模式短名，如 "练一休一" */
  modeLabel: string;
  /** 排期强制休息时的说明（如"按排期今天休息"）， null 则走默认文案 */
  scheduleNote: string | null;
  onSwitchToWorkout: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <TodayCardShell tone="warn">
      <div
        className="font-display font-semibold uppercase text-3"
        style={{ fontSize: 13, letterSpacing: '0.14em' }}
      >
        休息日 / {modeLabel}
      </div>
      <h2
        className="font-display text-1"
        style={{ margin: '8px 0 0', fontSize: 40, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}
      >
        主动恢复日
      </h2>
      <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        游泳 / 散步 / 拉伸，选一个就行
      </p>
      {scheduleNote ? (
        <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {scheduleNote}
        </p>
      ) : null}
      {state.doneToday ? (
        <div style={{ marginTop: 14 }}>
          <Tag>今天已打卡，streak 续上了</Tag>
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <GhostButton icon={<Icon name="waves" size={20} />} right={<Icon name="arrow-right" size={16} />} onClick={() => navigate('/rest')}>
          看看恢复建议
        </GhostButton>
      </div>
      <button
        type="button"
        onClick={onSwitchToWorkout}
        style={{
          display: 'block',
          margin: '14px auto 0',
          background: 'transparent',
          border: 'none',
          padding: '8px 12px',
          fontSize: 13,
          color: 'var(--text-3)',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        今天状态好，想练 →
      </button>
      <p className="text-3" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
        下一节：第 {state.nextLessonNumber} 课 · {state.nextWorkout.title}
      </p>
    </TodayCardShell>
  );
}

/* ================= 页面 ================= */

const MODE_LABEL: Record<ScheduleMode, string> = {
  '1on1off': '练一休一',
  '2on1off': '练二休一',
  weekdays: '固定星期',
};

/** 场地短标签（循环进度处展示，如"健身房版"） */
const VENUE_SHORT: Record<string, string> = {
  gym: '健身房版',
  home: '居家版',
  outdoor: '户外版',
  bodyweight: '自重版',
};

export default function Home(): JSX.Element {
  const [cycle] = useCycle();
  const [profile] = useProfile();
  const [schedule] = useSchedule();
  const [forceWorkout, setForceWorkout] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const spokenRef = useRef(false);

  const state = getTodayState({ forceWorkout, profile, schedule }, cycle);
  const isWorkout = state.type === 'workout';
  const firstLaunch = cycle.history.length === 0;

  // 休息日文案：排期强制休息（非"昨天练过"循环结果也非"已打卡"）时说明是按排期休息
  const scheduleNote = (() => {
    if (state.type !== 'rest' || state.doneToday || forceWorkout) return null;
    if (schedule.mode === 'weekdays' && !schedule.weekdays.includes(new Date().getDay())) {
      return '按排期今天休息，恢复好，下节课更有劲。';
    }
    if (schedule.mode === '2on1off') {
      return '连练两天了，今天该休——恢复好，下节课更有劲。';
    }
    return null;
  })();

  // 场地标签：有档案才显示（如"健身房版"），无档案老用户保持原样
  const venueTag = profile ? (VENUE_SHORT[bestVenue(profile.venues)] ?? null) : null;

  // 训练日态首次进入且语音开关开：读一句今日安排
  useEffect(() => {
    if (spokenRef.current || !isWorkout || state.type !== 'workout') return;
    spokenRef.current = true;
    speak(`今天练${state.workout.subtitle.replace(/\+/g, '，')}，${state.exercises.length} 个动作，加油`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkout]);

  return (
    <div>
      <ScreenHeader
        label="口袋私教 · POCKET COACH"
        title={isWorkout ? '今天练什么' : '今天不练，恢复'}
        actions={
          <>
            <StreakBadge streak={cycle.streak} onClick={() => setStreakOpen(true)} />
            <TTSToggle />
          </>
        }
      />

      {isWorkout && state.type === 'workout' ? (
        <WorkoutCard state={state} firstLaunch={firstLaunch} />
      ) : state.type === 'rest' ? (
        <RestCard
          state={state}
          modeLabel={MODE_LABEL[schedule.mode]}
          scheduleNote={scheduleNote}
          onSwitchToWorkout={() => setForceWorkout(true)}
        />
      ) : null}

      <CycleProgress currentLesson={cycle.nextWorkoutIndex} isRest={!isWorkout} mode={schedule.mode} venueTag={venueTag} />

      {isWorkout ? <DepartureChecklist /> : null}

      <QuickEntries onSupplement={() => setSupplementOpen(true)} />

      <StreakSheet open={streakOpen} onClose={() => setStreakOpen(false)} />
      <SupplementSheet open={supplementOpen} onClose={() => setSupplementOpen(false)} />
    </div>
  );
}
