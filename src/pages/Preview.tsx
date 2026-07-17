/**
 * 课前预习页（/preview）—— 实现规格：/mnt/agents/output/design/preview.md
 * 场景：地铁/公交上单手刷，5 分钟过完一节课。
 * 结构：ScreenHeader → §1 课程概览条（三个滚动数字 + 教练寄语）→ §2 编号旅程手风琴
 *   (01) 热身 → (02..) 动作（六要素完整卡）→ (0N) 总结与补剂（锁定预告）
 * 底部吸底 CTA「到健身房了，开始训练」→ startSession + /workout。
 * 休息日：只读预习下一课，CTA 换成「去休息日看看」。
 * 本页只读，不出现任何打卡按钮。
 */
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import EmptyState from '../components/EmptyState';
import { useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import { DangerTag, Tag, WarnTag } from '../components/Tag';
import TTSToggle from '../components/TTSToggle';
import { TAB_BAR_HEIGHT } from '../components/AppShell';
import SubstituteSheet, { SwapIcon } from '../components/library/SubstituteSheet';
import { ChevronDownIcon, ExternalIcon, StopIcon } from '../components/workout/icons';
import { warmupSpec } from '../components/workout/warmup';
import { weightSpec } from '../components/workout/weight';
import { zoneForExercise } from '../components/workout/zoneImage';
import { startSession, updateSession, useCycle, useSettings } from '../lib/store';
import { cancel, speak } from '../lib/tts';
import type { Exercise, Workout } from '../lib/types';
import { estimateWorkoutMinutes, getExerciseById, getTodayState, resolveWorkout } from '../lib/utils-workout';

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ================= 滚动数字 ================= */

function RollingNumber({ target, delay, size = 20 }: { target: number; delay: number; size?: number }): JSX.Element {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(count, target, reduce ? { duration: 0.1 } : { duration: 0.4, delay, ease: 'easeOut' });
    return () => controls.stop();
  }, [target, delay, count, reduce]);
  return (
    <motion.span className="num" style={{ fontSize: size, fontWeight: 600, lineHeight: 1, color: 'var(--accent)' }}>
      {rounded}
    </motion.span>
  );
}

/* ================= 六要素完整性校验 ================= */

function missingFields(ex: Exercise): string[] {
  const miss: string[] = [];
  if (!ex.equipment?.name || !ex.equipment?.look || !ex.equipment?.where) miss.push('器械描述');
  if (!ex.steps || ex.steps.length === 0) miss.push('步骤');
  if (!ex.mantra) miss.push('口诀');
  if (!ex.sets || !ex.reps) miss.push('组次');
  if (!ex.suggestedWeight) miss.push('建议重量');
  if (!ex.commonMistakes || ex.commonMistakes.length === 0) miss.push('常见错误');
  return miss;
}

/** reps 里的次数/时长主数字："每侧10-12（左侧先做…）" → "10-12"；"5分钟" → "5分钟"；无数字 → null */
function repsMain(reps: string): string | null {
  const m = reps.match(/\d+(?:-\d+)?/);
  return m ? m[0] : null;
}

/** 收起态组次 Tag："4组 × 10-12次"、"1组 × 5分钟"、"3组 × 30-45秒"；无数字时 "3组 · 每组吊到力竭" */
function setsRepsTag(ex: Exercise): string {
  const main = repsMain(ex.reps);
  if (main === null) return `${ex.sets}组 · ${ex.reps.split('（')[0]}`;
  const unit = /分钟/.test(ex.reps) ? '分钟' : /秒/.test(ex.reps) ? '秒' : /米/.test(ex.reps) ? '米' : '次';
  return `${ex.sets}组 × ${main}${unit}`;
}

/* ================= 动作六要素展开卡 ================= */

function ExerciseDetail({
  ex,
  speaking,
  onToggleSpeak,
  onSwap,
}: {
  ex: Exercise;
  speaking: boolean;
  onToggleSpeak: () => void;
  /** 有替代链时提供：打开「换替代动作」弹层 */
  onSwap?: () => void;
}): JSX.Element {
  const miss = missingFields(ex);
  if (miss.length > 0) {
    return (
      <div style={{ padding: '14px 18px 18px', borderLeft: '2px solid var(--warn)' }}>
        <div style={{ background: 'var(--warn-dim)', borderRadius: 4, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--warn)' }}>
            这个动作资料不全（缺：{miss.join('、')}），先在动作库里补一下。
          </p>
          <Link to="/library" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: 'var(--warn)', textDecoration: 'underline' }}>
            去动作库看看 →
          </Link>
        </div>
      </div>
    );
  }

  const zone = zoneForExercise(ex);
  const w = weightSpec(ex);
  const videoUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(ex.videoKeyword)}`;
  const sections: JSX.Element[] = [];

  /* 1. 在哪找 · 长什么样 */
  sections.push(
    <div key="where">
      <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
        在哪找 · 长什么样
      </div>
      <img
        src={zone.src}
        alt={`${zone.label}线稿图`}
        loading="lazy"
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4, marginTop: 10 }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Tag>{zone.label}</Tag>
        <Tag>{ex.equipment.name}</Tag>
      </div>
      <p className="text-1" style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.65 }}>
        {ex.equipment.where}
      </p>
      <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        长这样：{ex.equipment.look}
      </p>
    </div>,
  );

  /* 2. 怎么做 */
  sections.push(
    <div key="how">
      <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
        怎么做
      </div>
      <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ex.steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: 'var(--text-1)' }}>
            <span className="num" style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
              {i + 1}.
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>,
  );

  /* 3. 邪修口诀 */
  sections.push(
    <div key="mantra" style={{ background: 'var(--accent-dim)', borderRadius: 4, padding: '14px 16px', display: 'flex', gap: 10 }}>
      <span className="font-display" style={{ color: 'var(--accent)', fontSize: 28, lineHeight: 1, flexShrink: 0 }}>
        “
      </span>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: 'var(--accent)' }}>{ex.mantra}</p>
    </div>,
  );

  /* 4. 组数 × 次数 / 重量 */
  sections.push(
    <div key="dose">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
        <span className="num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: 'var(--text-1)' }}>
          {repsMain(ex.reps) !== null ? `${ex.sets}×${repsMain(ex.reps)}` : `${ex.sets}组`}
          {ex.unilateral ? <span style={{ fontSize: 16, color: 'var(--text-2)', marginLeft: 4 }}>每侧</span> : null}
        </span>
        <span className="num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: 'var(--accent)' }}>
          {w.kg !== null ? `${w.display}起` : '自重'}
        </span>
      </div>
      <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        目标：{ex.reps}
      </p>
      <p className="text-2" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        {ex.restSeconds > 0 ? `组间休息 ${ex.restSeconds} 秒 · ` : ''}
        {ex.suggestedWeight}
      </p>
    </div>,
  );

  /* 5. 常见错误 */
  sections.push(
    <div key="mistakes">
      <DangerTag>常见错误</DangerTag>
      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ex.commonMistakes.map((m, i) => (
          <li key={i} className="text-1" style={{ display: 'flex', gap: 8, fontSize: 16, lineHeight: 1.6 }}>
            <span style={{ color: 'var(--danger)', flexShrink: 0 }}>×</span>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>,
  );

  /* 6. 视听辅助（+ 换替代动作） */
  sections.push(
    <div key="av">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <GhostButton
          size="sm"
          icon={speaking ? <StopIcon size={16} /> : <Icon name="play" size={16} />}
          onClick={onToggleSpeak}
          style={speaking ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        >
          {speaking ? '停止' : '听要领'}
        </GhostButton>
        <GhostButton
          size="sm"
          icon={<ExternalIcon size={16} />}
          onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')}
        >
          视频搜索
        </GhostButton>
        {onSwap ? (
          <GhostButton size="sm" icon={<SwapIcon size={16} />} onClick={onSwap}>
            换替代动作
          </GhostButton>
        ) : null}
      </div>
      <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        视频跳到 B 站搜索「{ex.videoKeyword}」（外链，新窗口打开）
      </p>
    </div>,
  );

  return (
    <div style={{ borderLeft: '2px solid var(--accent)', padding: '4px 0 20px 18px', marginLeft: 2 }}>
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 22 }}
      >
        {sections.map((s, i) => (
          <motion.div
            key={i}
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } } }}
          >
            {s}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

/* ================= 手风琴行 ================= */

interface RowProps {
  index: number;
  num: string;
  open: boolean;
  onToggle: () => void;
  /** 收起态中部内容 */
  summary: JSX.Element;
  /** 展开态六要素卡（null = 仅热身数据缺失兜底时不渲染） */
  detail: JSX.Element | null;
}

function AccordionRow({ index, num, open, onToggle, summary, detail }: RowProps): JSX.Element {
  const reduce = useReducedMotion();
  const rowRef = useRef<HTMLDivElement | null>(null);

  /* 展开后滚动定位：行顶部对齐 header 下沿 */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => rowRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 320);
    return () => clearTimeout(t);
  }, [open, reduce]);

  return (
    <motion.div
      ref={rowRef}
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
      }}
      style={{ borderBottom: '1px solid var(--line)', scrollMarginTop: 20 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          minHeight: 72,
          padding: '12px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* 编号 (02)：入场时额外一次 opacity 脉冲 */}
        <motion.span
          className="font-display font-semibold uppercase text-3"
          style={{ fontSize: 13, letterSpacing: '0.14em', flexShrink: 0, width: 34 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.45, 1] }}
          transition={reduce ? { duration: 0.1 } : { delay: 0.15 + index * 0.05, duration: 0.5 }}
        >
          ({num})
        </motion.span>
        {summary}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0.1 : 0.25 }}
          style={{ flexShrink: 0, color: 'var(--text-3)', display: 'inline-flex' }}
        >
          <ChevronDownIcon size={20} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.3, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            {detail}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ================= 页面 ================= */

export default function Preview(): JSX.Element {
  const navigate = useNavigate();
  const [cycle] = useCycle();
  const [settings] = useSettings();
  const feedback = useFeedback();
  const reduce = useReducedMotion();

  const today = getTodayState({}, cycle);
  const isRestPreview = today.type === 'rest';
  const workout: Workout = isRestPreview ? today.nextWorkout : today.workout;
  const lessonNumber = isRestPreview ? today.nextLessonNumber : today.lessonNumber;
  const { warmup, exercises } = resolveWorkout(workout);
  const estimatedMinutes = estimateWorkoutMinutes(workout);
  const wspec = warmupSpec(warmup);

  /** openKey: 'warmup' | ex.id | null（手风琴单项展开） */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const pulseRef = useRef(false);

  /* 替代动作：页面级状态（位置下标 → 新动作 id），只改这次预习视图，不持久化 */
  const [swaps, setSwaps] = useState<Record<number, string>>({});
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  /* 应用替代映射：渲染用动作列表（替代动作换到原位置，视图即时更新） */
  const displayExercises = exercises.map((ex, i) => {
    const sid = swaps[i];
    return sid ? (getExerciseById(sid) ?? ex) : ex;
  });

  /* 离开页面停止朗读 */
  useEffect(() => () => cancel(), []);

  /* 滚动到底部时 CTA 轻提示一次（scale 1→1.02→1） */
  const [ctaPulse, setCtaPulse] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      if (pulseRef.current) return;
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 48) {
        pulseRef.current = true;
        setCtaPulse((n) => n + 1);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleSpeak = useCallback(
    (ex: Exercise) => {
      if (speakingId === ex.id) {
        cancel();
        setSpeakingId(null);
        return;
      }
      if (!settings.ttsOn) {
        feedback.toast('语音开关关着呢，点右上角喇叭打开');
        return;
      }
      setSpeakingId(ex.id);
      speak(ex.voiceScript, { onEnd: () => setSpeakingId((cur) => (cur === ex.id ? null : cur)) });
    },
    [speakingId, settings.ttsOn, feedback],
  );

  const totalRows = 1 + exercises.length + 1; // 热身 + 动作 + 总结
  const summaryNum = String(totalRows).padStart(2, '0');

  return (
    <div>
      {feedback.host}
      <ScreenHeader
        label={isRestPreview ? `今天休息 · 预习下一课（第 ${lessonNumber} 课 / 共 4 课）` : `第 ${lessonNumber} 课 / 共 4 课`}
        title={workout.subtitle}
        actions={<TTSToggle />}
      />

      {isRestPreview ? (
        <div style={{ marginBottom: 16 }}>
          <WarnTag>今天休息日，不训练</WarnTag>
          <p className="text-2" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            下面是下一课的内容，路上可以先预习。想打卡恢复活动就去休息日页。
          </p>
        </div>
      ) : null}

      {exercises.length === 0 ? (
        <EmptyState text="这节课的动作数据没配上，先去动作库逛逛。" actionLabel="去动作库" onAction={() => navigate('/library')} />
      ) : (
        <>
          {/* §1 课程概览条 */}
          <section
            aria-label="课程概览"
            style={{
              borderTop: '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {[
              { value: exercises.length, label: '个动作' },
              { value: estimatedMinutes, label: '约分钟', prefix: '约 ' },
              { value: 5, label: '分钟热身' },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '10px 0',
                  borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
                }}
              >
                {item.prefix ? <span style={{ fontSize: 13, color: 'var(--accent)' }}>{item.prefix}</span> : null}
                <RollingNumber target={item.value} delay={i * 0.1} />
                <span className="text-2" style={{ fontSize: 13 }}>
                  {item.label}
                </span>
              </div>
            ))}
          </section>
          <p className="text-2" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            {workout.coachNote}
          </p>

          {/* §2 编号旅程列表 */}
          <motion.section
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            initial="hidden"
            animate="show"
            style={{ marginTop: 24 }}
            aria-label="课程旅程"
          >
            {/* (01) 热身 */}
            <AccordionRow
              index={0}
              num="01"
              open={openKey === 'warmup'}
              onToggle={() => setOpenKey((cur) => (cur === 'warmup' ? null : 'warmup'))}
              summary={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0, display: 'inline-flex' }}>
                    <Icon name="timer" size={20} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="text-1" style={{ fontSize: 20, fontWeight: 600, display: 'block', lineHeight: 1.3 }}>热身</span>
                    <span className="text-2" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>{wspec.summary}</span>
                  </span>
                </span>
              }
              detail={warmup ? <ExerciseDetail ex={warmup} speaking={speakingId === warmup.id} onToggleSpeak={() => toggleSpeak(warmup)} /> : null}
            />

            {/* (02..) 动作（可能被替代映射换掉） */}
            {displayExercises.map((ex, i) => {
              const w = weightSpec(ex);
              const orig = exercises[i] ?? ex;
              const swapped = orig.id !== ex.id;
              return (
                <AccordionRow
                  key={`${i}-${ex.id}`}
                  index={i + 1}
                  num={String(i + 2).padStart(2, '0')}
                  open={openKey === ex.id}
                  onToggle={() => setOpenKey((cur) => (cur === ex.id ? null : ex.id))}
                  summary={
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="text-1" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>{ex.name}</span>
                        {ex.unilateral ? <WarnTag>先左后右</WarnTag> : null}
                        {swapped ? <Tag>已替换</Tag> : null}
                      </span>
                      <span style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Tag>{setsRepsTag(ex)}</Tag>
                        {w.tagText ? <Tag>{w.tagText}</Tag> : <Tag>自重</Tag>}
                      </span>
                    </span>
                  }
                  detail={
                    <ExerciseDetail
                      ex={ex}
                      speaking={speakingId === ex.id}
                      onToggleSpeak={() => toggleSpeak(ex)}
                      onSwap={orig.substitutes && orig.substitutes.length > 0 ? () => setSwapIndex(i) : undefined}
                    />
                  }
                />
              );
            })}

            {/* (0N) 总结与补剂：锁定预告，不可展开 */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } } }}
              style={{ borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, padding: '12px 0' }}
            >
              <span
                className="font-display font-semibold uppercase text-3"
                style={{ fontSize: 13, letterSpacing: '0.14em', flexShrink: 0, width: 34 }}
              >
                ({summaryNum})
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="text-3" style={{ fontSize: 20, fontWeight: 600, display: 'block', lineHeight: 1.3 }}>总结与补剂</span>
                <span className="text-3" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>
                  练完自动出现 · 蛋白粉+肌酸提醒
                </span>
              </span>
              <span className="text-3" style={{ flexShrink: 0 }}>
                <Icon name="check-circle" size={20} />
              </span>
            </motion.div>
          </motion.section>
        </>
      )}

      {/* 底部吸底 CTA（TabBar 上方） */}
      <motion.div
        initial={{ y: '160%' }}
        animate={{ y: 0 }}
        transition={reduce ? { duration: 0.1 } : { delay: 0.5, type: 'spring', stiffness: 300, damping: 26 }}
        style={{
          position: 'sticky',
          bottom: `calc(${TAB_BAR_HEIGHT + 12}px + env(safe-area-inset-bottom))`,
          marginTop: 28,
        }}
      >
        <motion.div
          key={ctaPulse}
          animate={ctaPulse > 0 && !reduce ? { scale: [1, 1.02, 1] } : undefined}
          transition={{ duration: 0.3 }}
        >
          {isRestPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PrimaryButton
                size="lg"
                icon={<Icon name="play" size={20} />}
                onClick={() => {
                  vibrate(30);
                  startSession(workout.id);
                  // exerciseIndex -1 = 热身阶段待开始（session 恢复约定）
                  updateSession({ exerciseIndex: -1, setIndex: 0, side: null, startedAt: Date.now() });
                  navigate('/workout');
                }}
              >
                今天状态好，就练这节课
              </PrimaryButton>
              <GhostButton right={<Icon name="arrow-right" size={18} />} onClick={() => navigate('/rest')}>
                去休息日看看
              </GhostButton>
            </div>
          ) : (
            <PrimaryButton
              size="lg"
              icon={<Icon name="play" size={20} />}
              onClick={() => {
                vibrate(30);
                startSession(workout.id);
                // exerciseIndex -1 = 热身阶段待开始（session 恢复约定）
                updateSession({ exerciseIndex: -1, setIndex: 0, side: null, startedAt: Date.now() });
                navigate('/workout');
              }}
            >
              到健身房了，开始训练
            </PrimaryButton>
          )}
        </motion.div>
      </motion.div>

      {/* 换替代动作（只改这次预习，不进计划） */}
      <SubstituteSheet
        open={swapIndex !== null}
        onClose={() => setSwapIndex(null)}
        original={swapIndex !== null ? (exercises[swapIndex] ?? null) : null}
        current={swapIndex !== null ? (displayExercises[swapIndex] ?? null) : null}
        onSwap={(ex) => {
          if (swapIndex === null) return;
          setSwaps((s) => ({ ...s, [swapIndex]: ex.id }));
          setSwapIndex(null);
          setOpenKey(ex.id); // 手风琴保持在换好的动作上展开
          feedback.toast(`换成${ex.name}了，只改这次预习`);
        }}
        onRevert={() => {
          if (swapIndex === null) return;
          const orig = exercises[swapIndex];
          setSwaps((s) => {
            const next = { ...s };
            delete next[swapIndex];
            return next;
          });
          setSwapIndex(null);
          if (orig) setOpenKey(orig.id);
          feedback.toast('换回原动作');
        }}
      />
    </div>
  );
}
