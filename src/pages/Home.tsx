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
  setDayPlan,
  shiftDate,
  todayStr,
  toggleChecklistItem,
  toggleSupplement,
  useCardioEntries,
  useChecklist,
  useCycle,
  useDayPlan,
  useDietEntries,
  useTargets,
  useWeightLog,
  useMinisCompleted,
  useProfile,
  useSchedule,
  useSupplements,
  useTodayVenue,
} from '../lib/store';
import { filterMinisForProfile, getMiniPack, miniDisplayName, sortMinisForProfile } from '../components/mini/minis';
import { getCapability } from '../lib/capability';
import type { Capability } from '../lib/capability';
import { bestVenue } from '../lib/profile';
import { speak } from '../lib/tts';
import type { ScheduleMode, Supplement, TodayRestState, TodayWorkoutState, Venue } from '../lib/types';
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

/** 今日场地 chips：null = 跟档案（默认）。单选 pill，只改今天，明天自动回档案 */
const VENUE_CHIPS: { value: Venue | null; label: string }[] = [
  { value: null, label: '跟档案（默认）' },
  { value: 'gym', label: '健身房' },
  { value: 'home', label: '居家' },
  { value: 'outdoor', label: '户外' },
  { value: 'bodyweight', label: '纯自重' },
];

/** 今日场地单选 chips（≥48px 热区，选中 accent） */
function VenueChips({ value, onChange }: { value: Venue | null; onChange: (v: Venue | null) => void }): JSX.Element {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
        今天在哪练
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }} role="radiogroup" aria-label="今天在哪练">
        {VENUE_CHIPS.map((chip) => {
          const active = value === chip.value;
          return (
            <button
              key={chip.label}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                vibrate(15);
                onChange(chip.value);
              }}
              style={{
                minHeight: 48,
                padding: '0 16px',
                borderRadius: 999,
                border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--text-2)',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition: 'border-color 150ms, color 150ms, background 150ms',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
        color: 'var(--accent-ink)',
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
          backgroundColor: tone === 'warn' ? 'var(--warn)' : 'var(--accent)',
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
          color: state === 'done' ? 'var(--on-accent)' : state === 'current' ? 'var(--accent-ink)' : 'var(--text-3)',
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
          color: state === 'current' ? 'var(--accent-ink)' : state === 'done' ? 'var(--text-2)' : 'var(--text-3)',
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
  venueTodayOnly,
}: {
  currentLesson: number;
  isRest: boolean;
  mode: ScheduleMode;
  /** 实际生效场地短名（今日选择 > 档案），无档案无覆盖时为 null */
  venueTag: string | null;
  /** 今天选了非档案场地：提示"仅今天" */
  venueTodayOnly: boolean;
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
          {venueTodayOnly ? (
            <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              仅今天，明天回档案默认。
            </p>
          ) : null}
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
          style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--accent-ink)', lineHeight: 1.5 }}
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

/* ================= §1.5 日常小练（今日卡片下方横区） ================= */

/**
 * 日常小练横滑 chip 区：主课表之外的碎片时间训练包。
 * 凯格尔按 profile.gender 过滤（男不显女版/女不显男版/未填两版都显示）；
 * 问卷「额外加强」选中的包置顶。点击进 /mini/:packId。
 */
function MiniSection(): JSX.Element | null {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [profile] = useProfile();
  const [doneToday] = useMinisCompleted();
  const packs = sortMinisForProfile(filterMinisForProfile(profile), profile);
  if (packs.length === 0) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="碎片">日常小练</SectionLabel>
      <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        几分钟一套，练完也算连续打卡。
      </p>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 14,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBottom: 4,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {packs.map((pack, i) => {
          const done = doneToday.includes(pack.id);
          return (
            <motion.button
              key={pack.id}
              type="button"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0.1 } : { delay: i * 0.05, duration: 0.25, ease: 'easeOut' }}
              onClick={() => {
                vibrate(15);
                navigate(`/mini/${pack.id}`);
              }}
              style={{
                flexShrink: 0,
                scrollSnapAlign: 'start',
                width: 208,
                minHeight: 120,
                padding: '14px 16px',
                background: 'var(--bg-raised)',
                border: '1px solid var(--line-strong)',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span className="text-1" style={{ flex: 1, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
                  {miniDisplayName(pack, profile)}
                </span>
                {done ? (
                  <span style={{ color: 'var(--accent-ink)', display: 'inline-flex', flexShrink: 0 }} aria-label="今天已练过">
                    <Icon name="check" size={16} strokeWidth={2.5} />
                  </span>
                ) : null}
              </span>
              <span className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)', lineHeight: 1 }}>
                约 {pack.minutes} 分钟
              </span>
              <span className="text-2" style={{ fontSize: 13, lineHeight: 1.5 }}>
                {pack.tagline}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

/* ================= §4 快捷入口 ================= */

function QuickEntries({ onSupplement, onWeight }: { onSupplement: () => void; onWeight: () => void }): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const entries: { icon: JSX.Element; label: string; onClick: () => void }[] = [
    { icon: <Icon name="walk" size={20} />, label: '跑步打卡', onClick: () => navigate('/cardio') },
    { icon: <Icon name="book" size={20} />, label: '预习动作', onClick: () => navigate('/preview') },
    { icon: <Icon name="plus" size={20} />, label: '记一笔饮食', onClick: () => navigate('/diet') },
    { icon: <Icon name="droplet" size={20} />, label: '肌酸打卡', onClick: onSupplement },
    { icon: <Icon name="user" size={20} />, label: '称体重', onClick: onWeight },
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

/* ================= 体重打卡 Sheet（v1.6） ================= */

function WeightSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [log, setLog] = useWeightLog();
  const today = todayStr();
  const existing = log[today];
  const [text, setText] = useState(existing?.toString() ?? '');
  useEffect(() => {
    if (open) setText(existing?.toString() ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  /* 最近一次记录（非今天），用于显示变化 */
  const prev = Object.entries(log)
    .filter(([d]) => d !== today)
    .sort(([a], [b]) => (a < b ? 1 : -1))[0];
  const save = (): void => {
    const kg = parseFloat(text);
    if (!Number.isFinite(kg) || kg < 30 || kg > 250) return;
    vibrate(20);
    setLog((p) => ({ ...p, [today]: Math.round(kg * 10) / 10 }));
    onClose();
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="今天称了多少？">
      <p className="text-2" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        早起空腹上完厕所称，最准。{prev ? `上次（${prev[0].slice(5)}）：${prev[1]} kg` : '第一次记，坚持两周看趋势。'}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="81.5"
          className="num"
          style={{
            flex: 1, fontSize: 34, fontWeight: 600, padding: '10px 14px',
            background: 'var(--bg-inset)', border: '1px solid var(--line)',
            borderRadius: 4, color: 'var(--text-1)', outline: 'none',
          }}
        />
        <span className="text-2" style={{ fontSize: 16 }}>kg</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <PrimaryButton size="lg" onClick={save} icon={<Icon name="check" size={20} />}>
          记下
        </PrimaryButton>
      </div>
    </BottomSheet>
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
                  color: checked ? 'var(--on-accent)' : 'var(--text-3)',
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
              <span style={{ fontSize: 13, color: checked ? 'var(--accent-ink)' : 'var(--text-3)', flexShrink: 0 }}>
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
                color: d.checked ? 'var(--on-accent)' : 'var(--text-3)',
              }}
            >
              {d.checked ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}>{d.date.slice(5).replace('-', '/')}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 4px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent-ink)' }}>绿点</span> 是训练日，<span style={{ color: 'var(--warn)' }}>黄点</span>{' '}
        是休息日恢复打卡——休息日也算坚持。
      </p>
    </BottomSheet>
  );
}

/* ================= §1 训练日卡 ================= */

function WorkoutCard({
  state,
  firstLaunch,
  capability,
  venueToday,
  onVenueChange,
}: {
  state: TodayWorkoutState;
  firstLaunch: boolean;
  capability: Capability;
  /** 今日场地覆盖（null = 跟档案） */
  venueToday: Venue | null;
  onVenueChange: (v: Venue | null) => void;
}): JSX.Element {
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
        <Tag>
          Lv.{capability.level} {capability.label} · 已练 {capability.lessonsDone} 节课
        </Tag>
        {tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
        {state.doneToday ? <WarnTag>今天已打卡</WarnTag> : null}
      </div>
      <VenueChips value={venueToday} onChange={onVenueChange} />
      {firstLaunch ? (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--accent-ink)', lineHeight: 1.5 }}>
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
      {/* 自由排：加班/没空 → 一键顺延，课程队列原地等，不欠不罚 */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => {
            vibrate(15);
            setDayPlan(todayStr(), 'rest');
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--text-3)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          今天练不了？点这里顺延 →
        </button>
      </div>
    </TodayCardShell>
  );
}

/* ================= §0.5 自由排（v1.5）：今天+后 6 天，点哪天改哪天 ================= */

const WEEK_CHARS = ['日', '一', '二', '三', '四', '五', '六'];

function PlanStrip({ todayType, schedule }: { todayType: 'workout' | 'rest'; schedule: { mode: ScheduleMode; weekdays: number[] } }): JSX.Element {
  const [dayPlan] = useDayPlan();
  const reduce = useReducedMotion();
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(todayStr(), i));
  return (
    <section style={{ marginTop: 24 }}>
      <SectionLabel index="排期">这周怎么练 · 点哪天改哪天</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        {days.map((date, i) => {
          const d = new Date(date + 'T12:00:00');
          /* 投影：weekdays 按星期表；其余从今天状态交替往后推（队列语义） */
          const projected: 'workout' | 'rest' =
            schedule.mode === 'weekdays'
              ? schedule.weekdays.includes(d.getDay())
                ? 'workout'
                : 'rest'
              : i % 2 === 0
                ? todayType
                : todayType === 'workout'
                  ? 'rest'
                  : 'workout';
          const override = dayPlan[date];
          const effective = override === 'train' ? 'workout' : override === 'rest' ? 'rest' : projected;
          const isToday = i === 0;
          const isTrain = effective === 'workout';
          return (
            <motion.button
              key={date}
              type="button"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0.1 } : { delay: i * 0.03, duration: 0.22, ease: 'easeOut' }}
              onClick={() => {
                vibrate(15);
                // 有覆盖 → 点一下撤销回默认；无覆盖 → 翻成与投影相反
                setDayPlan(date, override ? null : isTrain ? 'rest' : 'train');
              }}
              aria-label={`${isToday ? '今天' : `周${WEEK_CHARS[d.getDay()]}`}：${isTrain ? '训练日' : '休息日'}，点按切换`}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 64,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                borderRadius: 4,
                border: `1px solid ${isToday ? 'var(--accent)' : 'var(--line)'}`,
                background: isTrain ? 'var(--accent-dim)' : 'transparent',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                padding: '6px 0',
              }}
            >
              <span className="text-3" style={{ fontSize: 11, lineHeight: 1 }}>
                {isToday ? '今天' : `周${WEEK_CHARS[d.getDay()]}`}
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: isTrain ? 'var(--accent-ink)' : 'var(--text-3)',
                }}
              >
                {isTrain ? '练' : '休'}
              </span>
              {override ? <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--accent)' }} /> : <span style={{ width: 4, height: 4 }} />}
            </motion.button>
          );
        })}
      </div>
      <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        临时加班点"练"变"休"，计划自动顺延；再点一下恢复默认。课程进度不会乱。
      </p>
    </section>
  );
}

/* ================= §0.6 今日总消耗（v1.5：力量+有氧+小练合并） ================= */

function BurnCard(): JSX.Element {
  const [cycle] = useCycle();
  const [cardio] = useCardioEntries();
  const [minisDone] = useMinisCompleted();
  const [dietEntries] = useDietEntries(todayStr());
  const targets = useTargets();
  const today = todayStr();
  const workoutKcal = cycle.history.filter((h) => h.date === today).reduce((s, h) => s + h.kcal, 0);
  const cardioKcal = cardio.reduce((s, c) => s + c.kcal, 0);
  const minisKcal = Math.round(minisDone.reduce((s, id) => s + (getMiniPack(id)?.minutes ?? 8) * 5, 0));
  const activeKcal = workoutKcal + cardioKcal + minisKcal;
  /* 日常底盘消耗：BMR × 1.25（不算运动），运动消耗另加，避免和 TDEE 的活动系数重复计 */
  const baseKcal = Math.round(targets.bmr * 1.25);
  const totalBurn = baseKcal + activeKcal;
  const intake = dietEntries.reduce((s, e) => s + e.kcal, 0);
  const deficit = totalBurn - intake;
  /* 环：摄入 / 预算；预算=targetKcal（减脂目标热量） */
  const R = 52;
  const C = 2 * Math.PI * R;
  const ratio = Math.min(1, targets.targetKcal > 0 ? intake / targets.targetKcal : 0);
  const over = intake > targets.targetKcal;
  const rows: { label: string; kcal: number }[] = [
    { label: '日常代谢', kcal: baseKcal },
    { label: '力量训练', kcal: workoutKcal },
    { label: '有氧/跑步', kcal: cardioKcal },
    { label: '日常小练', kcal: minisKcal },
  ].filter((r) => r.kcal > 0);
  return (
    <section style={{ marginTop: 24 }}>
      <SectionLabel index="能量">今日热量差</SectionLabel>
      <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 4, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--bg-inset)" strokeWidth="10" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke={over ? 'var(--danger)' : 'var(--accent)'}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${C * ratio} ${C}`}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="56" textAnchor="middle" className="num" style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text-1)' }}>
              {intake}
            </text>
            <text x="60" y="76" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-3)' }}>
              / {targets.targetKcal} 大卡
            </text>
          </svg>
          <div style={{ flex: 1 }}>
            <div className="text-2" style={{ fontSize: 13 }}>吃进来 {intake} · 烧掉约 {totalBurn}</div>
            <div
              className="num"
              style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.15, color: deficit >= 0 ? 'var(--accent-ink)' : 'var(--danger)' }}
            >
              {deficit >= 0 ? `−${deficit}` : `+${-deficit}`}
            </div>
            <div className="text-3" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {deficit >= 0 ? '大卡缺口，保持住就在瘦' : '大卡盈余，今天超了'}
              {intake === 0 ? '（还没记饮食）' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          {rows.map((r) => (
            <span key={r.label} className="text-2" style={{ fontSize: 13 }}>
              {r.label} <span className="num" style={{ color: 'var(--text-1)' }}>{r.kcal}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
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
  const [dayPlan] = useDayPlan();
  const postponedToday = dayPlan[todayStr()] === 'rest';
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
      {postponedToday ? (
        <button
          type="button"
          onClick={() => {
            vibrate(15);
            setDayPlan(todayStr(), null);
          }}
          style={{
            display: 'block',
            margin: '6px auto 0',
            background: 'transparent',
            border: 'none',
            padding: '6px 12px',
            fontSize: 13,
            color: 'var(--text-3)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          （已顺延，点我撤销）
        </button>
      ) : null}
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
  const [venueToday, setVenueToday] = useTodayVenue();
  const [forceWorkout, setForceWorkout] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const spokenRef = useRef(false);

  // 课程解析优先级：今日选择 > 档案 bestVenue
  const state = getTodayState({ forceWorkout, profile, schedule, overrideVenue: venueToday }, cycle);
  const isWorkout = state.type === 'workout';
  const firstLaunch = cycle.history.length === 0;
  const capability = getCapability(cycle);

  /* 距上次训练的天数（队列顺延提示用）：无记录按 0 */
  const gapDays = (() => {
    const nonRest = cycle.history.filter((h) => h.workoutId !== 'REST');
    const last = nonRest[nonRest.length - 1];
    if (!last) return 0;
    const diff = Math.round((new Date(todayStr() + 'T12:00:00').getTime() - new Date(last.date + 'T12:00:00').getTime()) / 86400000);
    return Math.max(0, diff);
  })();

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

  // 场地标签：显示实际生效场地（今日选择 > 档案）；无档案无覆盖时不显示，老用户保持原样
  const profileVenue = profile ? bestVenue(profile.venues) : null;
  const effectiveVenue = venueToday ?? profileVenue;
  const venueTag = effectiveVenue ? (VENUE_SHORT[effectiveVenue] ?? null) : null;
  const venueTodayOnly = venueToday !== null && venueToday !== profileVenue;

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
        <WorkoutCard state={state} firstLaunch={firstLaunch} capability={capability} venueToday={venueToday} onVenueChange={setVenueToday} />
      ) : state.type === 'rest' ? (
        <RestCard
          state={state}
          modeLabel={MODE_LABEL[schedule.mode]}
          scheduleNote={scheduleNote}
          onSwitchToWorkout={() => {
            setForceWorkout(true);
            setDayPlan(todayStr(), 'train');
          }}
        />
      ) : null}

      {/* 歇了好几天才回来：计划已自动顺延，给用户一个交代 */}
      {isWorkout && gapDays >= 2 ? (
        <p className="text-2" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          隔了 {gapDays} 天没练？没事，计划已经自动顺延到今天了，直接跟着练，重量还按上次的来。
        </p>
      ) : null}

      <PlanStrip todayType={isWorkout ? 'workout' : 'rest'} schedule={schedule} />

      <BurnCard />

      <MiniSection />

      <CycleProgress
        currentLesson={cycle.nextWorkoutIndex}
        isRest={!isWorkout}
        mode={schedule.mode}
        venueTag={venueTag}
        venueTodayOnly={venueTodayOnly}
      />

      {isWorkout ? <DepartureChecklist /> : null}

      <QuickEntries onSupplement={() => setSupplementOpen(true)} onWeight={() => setWeightOpen(true)} />

      <StreakSheet open={streakOpen} onClose={() => setStreakOpen(false)} />
      <SupplementSheet open={supplementOpen} onClose={() => setSupplementOpen(false)} />
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
    </div>
  );
}
