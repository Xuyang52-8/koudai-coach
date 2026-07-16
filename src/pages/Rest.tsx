/**
 * 休息日页（/rest）
 * 实现规格：/mnt/agents/output/design/rest.md —— 休息日绝不空白。
 * - 头部：illust-rest.svg 通栏 + caption + coachNote（program.json restDay）
 * - §1 三个主动恢复方案（游泳·水中走路 / 快走 / 全身拉伸，拉伸含展开动作清单）
 *   完成任一 → completeRestDay(kcal) + 打勾震动 + 顶部浮出"streak +1"
 * - §2 身体感觉三态（满血 / 一般 / 很疲惫；很疲惫 → 安慰 + 计划顺延说明）
 * - §3 补剂照常（肌酸打卡，与 summary/饮食页共享状态）
 * - 进入页面 TTS 一句（服从全局语音开关）
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '../components/BottomSheet';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { useFeedback } from '../components/feedback';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import Tag from '../components/Tag';
import TTSToggle from '../components/TTSToggle';
import programJson from '../data/program.json';
import { completeRestDay, todayStr, toggleSupplement, useCycle, useStoreKey, useSupplements } from '../lib/store';
import { speak } from '../lib/tts';
import type { Program, RestOption } from '../lib/types';
import { getNextWorkoutInfo, LESSON_SHORT_NAMES } from '../lib/utils-workout';

const program = programJson as Program;
const restDay = program.restDay;

const OPTION_ICON: Record<string, IconName> = { swim: 'waves', walk: 'walk', stretch: 'stretch' };
const OPTION_CHECKIN: Record<string, string> = { swim: '今天游了 ✓', walk: '今天走了 ✓', stretch: '拉伸完了 ✓' };

/** 拉伸动作清单（rest.md §1③：默认展开，每行 = 动作名 + 时长 + 一句口诀） */
const STRETCH_MOVES: { name: string; duration: string; tip: string }[] = [
  { name: '大腿前侧拉伸', duration: '每边 40秒', tip: '扶墙拉脚背，膝盖并紧' },
  { name: '大腿后侧拉伸', duration: '每边 40秒', tip: '腿伸直去摸脚尖，够不到没关系' },
  { name: '臀部拉伸', duration: '每边 40秒', tip: '跷二郎腿躺下，抱下面那条腿' },
  { name: '胸肩拉伸', duration: '40秒', tip: '手扶门框，身体往前转' },
  { name: '婴儿式放松', duration: '60秒', tip: '跪坐趴下，手臂往前伸，深呼吸' },
];

const FEELS = [
  { id: 'full', label: '满血' },
  { id: 'ok', label: '一般' },
  { id: 'tired', label: '很疲惫' },
] as const;
type FeelId = (typeof FEELS)[number]['id'];

/** useStoreKey 的稳定 fallback（避免每次渲染新引用） */
const EMPTY_OPTIONS: Record<string, boolean> = {};
const EMPTY_FEEL = '';

/* ================= §1 恢复方案卡 ================= */

interface OptionCardProps {
  option: RestOption;
  recommended: boolean;
  checked: boolean;
  delay: number;
  onCheckin: () => void;
}

function OptionCard({ option, recommended, checked, delay, onCheckin }: OptionCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const isStretch = option.icon === 'stretch';
  const [stretchOpen, setStretchOpen] = useState(true);
  const icon = OPTION_ICON[option.icon] ?? 'walk';
  // 拉伸选项的 detail 就是清单本体（①…⑤），改用电报式一句 + 下方展开清单，避免重复
  const detail = isStretch ? '每个部位 30 秒 × 2 组，拉到微酸就停，别弹震。' : option.detail;

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { delay, duration: 0.3, ease: 'easeOut' }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: 18,
      }}
    >
      {/* 已打卡：顶部 3px accent 顶线 */}
      <AnimatePresence>
        {checked ? (
          <motion.div
            key="topline"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.4, ease: 'easeOut' }}
            style={{ position: 'absolute', top: 0, left: 0, height: 3, background: 'var(--accent)' }}
          />
        ) : null}
      </AnimatePresence>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', color: 'var(--accent)', flexShrink: 0 }}>
          <Icon name={icon} size={24} />
        </span>
        <h3 className="font-display text-1" style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>
          {option.title}
        </h3>
        {recommended ? <Tag>最推荐</Tag> : null}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {option.durationMin} 分钟 · 约消耗 {option.kcal} 大卡
        </span>
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--text-1)' }}>{detail}</p>

      {isStretch ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setStretchOpen((v) => !v)}
            aria-expanded={stretchOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              padding: '4px 0',
              fontSize: 13,
              color: 'var(--accent)',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            拉伸动作清单
            <motion.span
              animate={{ rotate: stretchOpen ? 90 : 0 }}
              transition={{ duration: reduce ? 0.1 : 0.2 }}
              style={{ display: 'inline-flex' }}
            >
              <Icon name="arrow-right" size={14} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {stretchOpen ? (
              <motion.div
                key="stretch-list"
                initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.3, ease: 'easeOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ marginTop: 6 }}>
                  {STRETCH_MOVES.map((mv, i) => (
                    <motion.div
                      key={mv.name}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduce ? { duration: 0.1 } : { delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: i < STRETCH_MOVES.length - 1 ? '1px solid var(--line)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, color: 'var(--text-1)' }}>{mv.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{mv.tip}</div>
                      </div>
                      <span className="num" style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                        {mv.duration}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {checked ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 48,
              borderRadius: 4,
              background: 'var(--accent)',
              color: '#060607',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <Icon name="check" size={18} strokeWidth={2.5} />
            已完成
          </div>
        ) : (
          <GhostButton size="sm" onClick={onCheckin}>
            {OPTION_CHECKIN[option.icon] ?? '今天恢复了 ✓'}
          </GhostButton>
        )}
      </div>
    </motion.section>
  );
}

/* ================= §2 身体感觉三态 ================= */

function FeelSection({ feel, onSelect, lessonNumber }: { feel: FeelId | ''; onSelect: (f: FeelId) => void; lessonNumber: number }): JSX.Element {
  const reduce = useReducedMotion();
  const feedbackText =
    feel === 'full'
      ? `行，明天第 ${lessonNumber} 课照常。`
      : feel === 'ok'
        ? '正常，明天上课重量不变。'
        : feel === 'tired'
          ? '累就好好休息，这不丢人——明天再练也来得及，计划自动顺延。'
          : '';
  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="顺手">身体感觉</SectionLabel>
      <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
        {FEELS.map((f) => {
          const active = feel === f.id;
          return (
            <motion.div
              key={f.id}
              animate={active && !reduce ? { scale: [0.95, 1] } : { scale: 1 }}
              transition={active && !reduce ? { type: 'spring', stiffness: 400, damping: 18 } : { duration: 0.1 }}
              style={{ flex: 1 }}
            >
              <GhostButton
                size="md"
                aria-pressed={active}
                onClick={() => onSelect(f.id)}
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#060607' : 'var(--text-1)',
                  border: active ? 'none' : '1px solid var(--line-strong)',
                  transition: 'background 200ms, color 200ms',
                }}
              >
                {f.label}
              </GhostButton>
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {feedbackText ? (
          <motion.p
            key={feel}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.25, ease: 'easeOut' }}
            style={{
              margin: '12px 0 0',
              fontSize: 13,
              lineHeight: 1.6,
              color: feel === 'tired' ? 'var(--warn)' : 'var(--accent)',
            }}
          >
            {feedbackText}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/* ================= §3 补剂照常 ================= */

function SupplementSection(): JSX.Element {
  const [supp] = useSupplements();
  const { celebrate, vibrate } = useFeedback();
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { delay: 0.25, duration: 0.3, ease: 'easeOut' }}
      style={{ marginTop: 28 }}
    >
      <SectionLabel index="补剂">照常喝</SectionLabel>
      <div
        style={{
          marginTop: 14,
          borderLeft: '2px solid var(--warn)',
          paddingLeft: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
        }}
      >
        <p style={{ flex: 1, margin: 0, fontSize: 16, lineHeight: 1.6, color: 'var(--text-1)' }}>
          肌酸今天照喝：3-5g，休息日也要喝。
        </p>
        <button
          type="button"
          aria-pressed={supp.creatine}
          onClick={() => {
            const nowOn = toggleSupplement('creatine');
            if (nowOn) celebrate('肌酸打卡，白天多喝水');
            else vibrate(15);
          }}
          style={{
            flexShrink: 0,
            minWidth: 88,
            minHeight: 48,
            padding: '0 14px',
            borderRadius: 4,
            border: supp.creatine ? 'none' : '1px solid var(--line-strong)',
            background: supp.creatine ? 'var(--accent)' : 'transparent',
            color: supp.creatine ? '#060607' : 'var(--text-1)',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            transition: 'background 200ms, color 200ms',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {supp.creatine ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}
          {supp.creatine ? '已喝' : '喝了'}
        </button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
        今天不用喝蛋白粉，练完才喝。
      </p>
    </motion.section>
  );
}

/* ================= 页面 ================= */

export default function Rest(): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [cycle] = useCycle();
  const today = todayStr();
  const { workout: nextWorkout, lessonNumber, index } = getNextWorkoutInfo(cycle);
  const restDoneToday = cycle.history.some((h) => h.date === today && h.workoutId === 'REST');

  const [doneMap, setDoneMap] = useStoreKey<Record<string, boolean>>(`restOptions:${today}`, EMPTY_OPTIONS);
  const [feel, setFeel] = useStoreKey<FeelId | ''>(`restFeel:${today}`, EMPTY_FEEL);
  const { celebrate, host } = useFeedback();

  const [banner, setBanner] = useState(false);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trainSheetOpen, setTrainSheetOpen] = useState(false);
  const spokenRef = useRef(false);

  // 进入页面读一句（服从全局语音开关，同屏有文字冗余）
  useEffect(() => {
    if (spokenRef.current) return;
    spokenRef.current = true;
    speak('今天休息，去走走路或者拉拉筋，恢复也是训练的一部分');
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  function showBanner(): void {
    setBanner(true);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(false), 2500);
  }

  function checkin(option: RestOption | null): void {
    completeRestDay(option?.kcal ?? 0);
    if (option) setDoneMap((prev) => ({ ...prev, [option.title]: true }));
    celebrate('恢复也算训练，streak 续上了');
    showBanner();
  }

  return (
    <div>
      {host}
      <ScreenHeader label="休息 · REST" title="今天休息·主动恢复" actions={<TTSToggle />} />

      {/* 顶部插画 + caption + coachNote */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.4, ease: 'easeOut' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}illust-rest.svg`}
          alt="泳镜、运动鞋和卷起的瑜伽垫线稿"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: 4,
            border: '1px solid var(--line)',
          }}
        />
      </motion.div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
        肌肉是在休息的时候长的，恢复也是训练的一部分。
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{restDay.coachNote}</p>
      {restDoneToday ? (
        <div style={{ marginTop: 12 }}>
          <Tag>今天已打卡，streak 续上了</Tag>
        </div>
      ) : null}

      {/* §1 三选一恢复方案 */}
      <section style={{ marginTop: 28 }}>
        <SectionLabel index="恢复">三选一，动了就算</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {restDay.options.map((opt, i) => (
            <OptionCard
              key={opt.title}
              option={opt}
              recommended={i === 0}
              checked={Boolean(doneMap[opt.title])}
              delay={0.08 * i}
              onCheckin={() => checkin(opt)}
            />
          ))}
        </div>
        {!restDoneToday ? (
          <button
            type="button"
            onClick={() => checkin(null)}
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
            三项都不想？下楼走两步也算 —— 直接打卡
          </button>
        ) : null}
      </section>

      {/* §2 身体感觉 */}
      <FeelSection feel={feel} onSelect={(f) => setFeel(f)} lessonNumber={lessonNumber} />

      {/* §3 补剂照常 */}
      <SupplementSection />

      {/* 底部 */}
      <p style={{ margin: '32px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, textAlign: 'center' }}>
        明天见：第 {lessonNumber} 课 · {LESSON_SHORT_NAMES[index] ?? nextWorkout.title}（{nextWorkout.subtitle}）
      </p>
      <div style={{ marginTop: 12 }}>
        <GhostButton onClick={() => navigate('/')}>回到今日</GhostButton>
      </div>
      <button
        type="button"
        onClick={() => setTrainSheetOpen(true)}
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
        状态爆棚，今天就想练 →
      </button>

      {/* 顶部浮出打卡提示（2.5s 自动淡出） */}
      <AnimatePresence>
        {banner ? (
          <motion.div
            key="rest-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.3, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: 'calc(16px + env(safe-area-inset-top))',
              left: 0,
              right: 0,
              zIndex: 70,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: 4,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              今天恢复打卡完成，streak +1
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 想训练确认 sheet */}
      <BottomSheet open={trainSheetOpen} onClose={() => setTrainSheetOpen(false)} title="今天就想练？">
        <div style={{ paddingBottom: 4 }}>
          <p style={{ margin: '4px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--text-1)' }}>
            行，那今天算训练日，明天强制休息。
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
            下一节：第 {lessonNumber} 课 · {nextWorkout.title}（{nextWorkout.subtitle}）。
          </p>
          <div style={{ marginTop: 16 }}>
            <PrimaryButton
              icon={<Icon name="play" size={20} />}
              onClick={() => {
                setTrainSheetOpen(false);
                navigate('/preview');
              }}
            >
              去热身，开练
            </PrimaryButton>
          </div>
          <div style={{ marginTop: 10 }}>
            <GhostButton size="sm" onClick={() => setTrainSheetOpen(false)}>
              再想想
            </GhostButton>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
