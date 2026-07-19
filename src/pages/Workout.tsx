/**
 * 训练进行页（/workout）—— 全站核心页。实现规格：/mnt/agents/output/design/workout.md
 * 三阶段：A 热身引导 → B 动作循环（动作卡 ⇄ RestTimerOverlay）→ 完成跳 /summary。
 *
 * session 恢复约定（WorkoutSession 字段不能改，故复用 number 语义）：
 *   exerciseIndex = -1 → 热身阶段；>= 0 → 动作下标。setIndex = 当前动作已完成组数。
 *   side：单侧动作当前侧（'L'/'R'），双侧为 null。startedAt 跨天自动作废。
 * 单侧强制：永远左侧先做，右侧按钮在左侧完成前 disabled（长按提示「先练弱的左边，私教说的。」）。
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '../components/BottomSheet';
import { DangerButton, GhostButton, PrimaryButton } from '../components/Buttons';
import { CheckDraw, useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import RestTimerOverlay from '../components/RestTimerOverlay';
import SectionLabel from '../components/SectionLabel';
import SetDot from '../components/SetDot';
import { DangerTag, Tag, WarnTag } from '../components/Tag';
import TTSToggle from '../components/TTSToggle';
import SubstituteSheet, { SwapIcon } from '../components/library/SubstituteSheet';
import RpeSheet from '../components/rpe/RpeSheet';
import BigActionButton from '../components/workout/BigActionButton';
import { useSkips, useWorkoutExtra } from '../components/workout/extra';
import type { SkipEntry } from '../components/workout/extra';
import { ExternalIcon, MinusIcon, StopIcon } from '../components/workout/icons';
import { warmupSpec } from '../components/workout/warmup';
import { clampWeight, formatKg, weightSpec } from '../components/workout/weight';
import { zoneForExercise } from '../components/workout/zoneImage';
import { adjustedReps, adjustedWeightKg, hasAdjustment, rpeToast } from '../lib/adjust';
import type { RpeChoice } from '../lib/adjust';
import { useBgAudioKeepAlive } from '../lib/keepalive';
import {
  applyRpeOverride,
  clearSession,
  getSession,
  startSession,
  todayStr,
  updateSession,
  useCycle,
  useExerciseOverride,
  useProfile,
  useSession,
  useSettings,
  useStoreKey,
  useTodayVenue,
} from '../lib/store';
import { bestVenue } from '../lib/profile';
import { cancel, speak } from '../lib/tts';
import type { Exercise, Venue } from '../lib/types';
import { estimateWorkoutKcal, getExerciseById, getTodayState, program, resolveExercisesForProfile } from '../lib/utils-workout';
import { useWakeLock } from '../lib/wakelock';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** 次要操作文字按钮样式：小号、无框、--text-2，降级不抢大圆主按钮视觉 */
const SECONDARY_ACTION_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '6px 2px',
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
};

/**
 * 要领朗读脚本：动作名 + 口语步骤 + 邪修口诀（拼接后走 speak()，内部按句切分排队）。
 * 风格对齐 CustomExerciseForm 的自动合成 voiceScript。
 */
function scriptForExercise(ex: Exercise): string {
  const steps = ex.steps
    .filter(Boolean)
    .map((t, i) => `第${i + 1}步，${t}`)
    .join('。');
  return `${ex.name}。怎么做：${steps}。记住口诀：${ex.mantra}。`;
}

/* ================= 阶段 A：热身引导 ================= */

function WarmupStage({
  warmup,
  onFinish,
}: {
  warmup: Exercise | null;
  onFinish: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const spec = warmupSpec(warmup);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTsRef = useRef(0);
  const zone = warmup ? zoneForExercise(warmup) : { src: './zone-treadmill.svg', label: '有氧区' };

  /* 正计时（时间戳法，超时不响铃继续累加） */
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [started]);

  const overtime = elapsed >= spec.durationSec;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const pct = Math.min(100, (elapsed / spec.durationSec) * 100);

  return (
    <motion.div
      key="warmup-stage"
      initial={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { x: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0.1 : 0.28, ease: 'easeOut' }}
    >
      <SectionLabel index="01">热身</SectionLabel>

      <img
        src={zone.src}
        alt="热身器械线稿图"
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4, marginTop: 16 }}
      />

      <h2 className="font-display text-1" style={{ margin: '18px 0 0', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {spec.title}
      </h2>

      {/* 三个大数字（stagger scale .8→1 spring）——隔一米也要看得清 */}
      <div style={{ display: 'flex', marginTop: 14, borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        {spec.params.map((p, i) => (
          <motion.div
            key={p.unit}
            initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.1 } : { delay: i * 0.1, type: 'spring', stiffness: 260, damping: 18 }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '14px 0',
              borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
            }}
          >
            <span className="num" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: 'var(--accent)' }}>
              {p.value}
            </span>
            <span className="text-2" style={{ fontSize: 13 }}>
              {p.unit}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="text-2" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        {spec.fallback}
      </p>

      {/* 大数字计时 + 进度条 */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <motion.div
          key={`${mm}:${ss}`}
          animate={started && !reduce ? { scale: [1, 1.015, 1] } : undefined}
          transition={{ duration: 0.12 }}
          className="num"
          style={{
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1,
            color: started ? (overtime ? 'var(--warn)' : 'var(--text-1)') : 'var(--text-3)',
          }}
        >
          {mm}:{ss}
        </motion.div>
        <div className="text-2" style={{ marginTop: 6, fontSize: 13 }}>
          {!started ? `目标 ${spec.durationSec / 60}:00` : overtime ? '到点了，多走走也行' : `目标 ${spec.durationSec / 60}:00，微微出汗就算数`}
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden', marginTop: 14 }}>
          <motion.div
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: 999, background: overtime ? 'var(--warn)' : 'var(--accent)' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
        {!started ? (
          <PrimaryButton
            size="lg"
            icon={<Icon name="play" size={20} />}
            onClick={() => {
              startTsRef.current = Date.now();
              setStarted(true);
              vibrate(30);
            }}
          >
            开始走，点开始
          </PrimaryButton>
        ) : (
          <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={onFinish}>
            热身完成，进入动作
          </PrimaryButton>
        )}
        <GhostButton onClick={onFinish}>{started ? '不等了，直接进动作' : '我热身完了，跳过'}</GhostButton>
      </div>
    </motion.div>
  );
}

/* ================= 动作间过场（600ms 打勾大圆 + 下一动作预告） ================= */

function ExerciseTransition({ nextName }: { nextName: string }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 75,
        background: 'var(--bg-inset)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <CheckDraw size={88} />
      <div className="font-display text-1" style={{ fontSize: 28, fontWeight: 700 }}>
        这个动作拿下
      </div>
      <div className="text-2" style={{ fontSize: 14 }}>下一个：{nextName}</div>
    </motion.div>
  );
}

/* ================= 长按撤销的已完成 SetDot ================= */

function UndoableDot({ index, onUndo }: { index: number; onUndo: () => void }): JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clear, []);
  return (
    <span
      onPointerDown={() => {
        clear();
        timerRef.current = setTimeout(onUndo, 500);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      style={{ display: 'inline-flex', touchAction: 'manipulation' }}
      aria-label={`第 ${index} 组已完成，长按撤销`}
    >
      <SetDot state="done" index={index} />
    </span>
  );
}

/* ================= 页面 ================= */

interface RestPlan {
  seconds: number;
  nextLabel: string;
  doneCue: string;
  tip: string;
}

/** 场地短名（顶部"今天在哪练"Tag 用） */
const VENUE_TODAY_SHORT: Record<Venue, string> = {
  gym: '健身房',
  home: '居家',
  outdoor: '户外',
  bodyweight: '纯自重',
};

export default function Workout(): JSX.Element {
  const navigate = useNavigate();
  const [cycle] = useCycle();
  const [session] = useSession();
  const [settings] = useSettings();
  const [profile] = useProfile();
  const [venueToday] = useTodayVenue();
  const feedback = useFeedback();
  const reduce = useReducedMotion();
  /* 防锁屏：训练页持有 screen Wake Lock（不支持的环境静默降级） */
  useWakeLock(settings.keepScreenOn ?? true);

  /* ---------- 解析当前课：session 优先（中断恢复），否则今天的课 ---------- */
  const today = getTodayState({}, cycle);
  const meta = useMemo(() => {
    if (session) {
      const idx = program.workouts.findIndex((w) => w.id === session.workoutId);
      if (idx >= 0) return { workout: program.workouts[idx], lessonNumber: idx + 1 };
    }
    if (today.type === 'workout') return { workout: today.workout, lessonNumber: today.lessonNumber };
    return null;
  }, [session, today]);

  /* 场地优先级：今日选择 > 档案 bestVenue（与首页"今天在哪练"联动） */
  const baseExercises = useMemo(
    () => (meta ? resolveExercisesForProfile(meta.workout, profile, venueToday).exercises : []),
    [meta, profile, venueToday],
  );
  const warmup = useMemo(
    () => (meta ? resolveExercisesForProfile(meta.workout, profile, venueToday).warmup : null),
    [meta, profile, venueToday],
  );

  /* ---------- 确保 session 存在且是今天的（跨天作废） ---------- */
  const workoutId = meta?.workout.id ?? null;
  useEffect(() => {
    if (!workoutId) return;
    const s = getSession();
    const fresh = s !== null && s.workoutId === workoutId && todayStr(new Date(s.startedAt)) === todayStr();
    if (!fresh) {
      startSession(workoutId);
      updateSession({ exerciseIndex: -1, setIndex: 0, side: null, startedAt: Date.now() });
    }
  }, [workoutId]);

  /* ---------- 本地 UI 状态 ---------- */
  const [restPlan, setRestPlan] = useState<RestPlan | null>(null);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const [transitionNext, setTransitionNext] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [weightBump, setWeightBump] = useState(0); // 重量数字滚动方向 +1/-1
  const [rpeTarget, setRpeTarget] = useState<Exercise | null>(null); // 刚完成、待评价的动作
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSpeakRef = useRef(false);
  /** 朗读代数：手动停止/关开关后使旧的 onEnd 串联失效，避免停了又被接话 */
  const speakSeqRef = useRef(0);
  /** 自动滚到底部主按钮的去重：记录上一次滚动落点对应的动作下标（-1=热身） */
  const scrolledKeyRef = useRef(-1);

  const [weights, setWeights] = useStoreKey<Record<string, number>>('weights', {});
  const [skips, setSkips] = useSkips(todayStr());
  const [, setExtra] = useWorkoutExtra();

  /* 替代动作映射：按 session 日期持久化（刷新/锁屏恢复不丢），位置下标 → 新动作 id */
  const sessionDate = session ? todayStr(new Date(session.startedAt)) : todayStr();
  const [swaps, setSwaps] = useStoreKey<Record<number, string>>(`swaps:${sessionDate}`, {});

  /* 渲染用动作列表：应用替代映射（进度与组次按新动作 sets 重新计） */
  const exercises = useMemo(
    () =>
      baseExercises.map((e, i) => {
        const sid = swaps[i];
        return sid ? (getExerciseById(sid) ?? e) : e;
      }),
    [baseExercises, swaps],
  );

  /* 恢复提示（仅首次进入时计算一次）：接着上次继续 */
  const [resumeHint] = useState(() => {
    const s = getSession();
    return (
      s !== null &&
      s.exerciseIndex >= 0 &&
      todayStr(new Date(s.startedAt)) === todayStr() &&
      (s.exerciseIndex > 0 || s.setIndex > 0 || s.side === 'R')
    );
  });

  /* 离开页面：停朗读（含失效 onEnd 串联）、清过场计时 */
  useEffect(
    () => () => {
      speakSeqRef.current += 1;
      cancel();
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  const phase: 'warmup' | 'exercise' = !session || session.exerciseIndex < 0 ? 'warmup' : 'exercise';
  const exerciseIndex = phase === 'exercise' && session ? Math.min(session.exerciseIndex, Math.max(0, exercises.length - 1)) : 0;
  const ex: Exercise | null = phase === 'exercise' ? (exercises[exerciseIndex] ?? null) : null;
  const setIndex = session?.setIndex ?? 0;
  const isLastExercise = exerciseIndex === exercises.length - 1;

  /* ---------- 锁屏音频保活：静音循环 + Media Session（安卓优先，iOS 尽力而为） ---------- */
  const hasWorkout = meta !== null;
  useBgAudioKeepAlive(
    (settings.bgAudioKeepAlive ?? true) && hasWorkout && session !== null,
    phase === 'warmup' ? '热身' : (ex?.name ?? ''),
  );

  /* ---------- RPE 覆盖：当前动作的调整量（步进器初值 / 次数文案 / 「已为你调整」Tag） ---------- */
  const [exOverride] = useExerciseOverride(ex?.id ?? null);
  const adjustedBaseKg = useMemo(() => (ex ? adjustedWeightKg(ex, exOverride) : null), [ex, exOverride]);

  /* ---------- 动作卡切换自动朗读（需 ttsOn && ttsAuto）：含热身进场、热身→动作1、动作间切换；单侧左右切换不在依赖里，不重复读 ---------- */
  useEffect(() => {
    if (!hasWorkout) return;
    if (!settings.ttsOn || !(settings.ttsAuto ?? true)) {
      // 总开关/自动朗读关闭：切换动作或刚关掉开关时，停掉当前朗读
      speakSeqRef.current += 1;
      cancel();
      setSpeaking(false);
      return;
    }
    if (phase === 'warmup') {
      const seq = ++speakSeqRef.current;
      setSpeaking(true);
      speak(warmup?.voiceScript ?? '先热身五分钟，让身体热起来。', {
        onEnd: () => {
          if (speakSeqRef.current === seq) setSpeaking(false);
        },
      });
      return;
    }
    if (skipAutoSpeakRef.current) {
      // 热身收尾时已手动串联播报，跳过本次自动朗读
      skipAutoSpeakRef.current = false;
      return;
    }
    if (ex) {
      const seq = ++speakSeqRef.current;
      setSpeaking(true);
      speak(scriptForExercise(ex), {
        onEnd: () => {
          if (speakSeqRef.current === seq) setSpeaking(false);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exerciseIndex, settings.ttsOn, settings.ttsAuto, hasWorkout]);

  /* ---------- 收尾：写快照 → 清 session → 跳总结 ---------- */
  const finishWorkout = useCallback(
    (skippedList: SkipEntry[]) => {
      if (!meta || !session) return;
      const finishedAt = Date.now();
      const totalSets = exercises.reduce((s, e) => s + Math.max(1, e.sets), 0);
      /* 完成组数：完整做完的动作计全部组；跳过的动作计跳过前已完成的组 */
      const doneSets = exercises.reduce((sum, e) => {
        const sk = skippedList.find((s) => s.name === e.name);
        return sum + (sk ? Math.min(sk.doneSets, Math.max(1, e.sets)) : Math.max(1, e.sets));
      }, 0);
      setExtra({
        date: todayStr(),
        workoutId: meta.workout.id,
        lessonNumber: meta.lessonNumber,
        workoutTitle: meta.workout.title,
        workoutSubtitle: meta.workout.subtitle,
        kcal: estimateWorkoutKcal(meta.workout),
        startedAt: session.startedAt,
        finishedAt,
        doneSets,
        totalSets,
        skipped: skippedList.map((s) => s.name),
        counted: false,
      });
      setSkips([]);
      clearSession();
      navigate('/summary');
    },
    [meta, session, exercises, setExtra, setSkips, navigate],
  );

  /* ---------- 休息计时：结束后推进 ---------- */
  const openRest = useCallback((plan: RestPlan, after: () => void) => {
    if (plan.seconds <= 0) {
      after();
      return;
    }
    pendingAdvanceRef.current = after;
    setRestPlan(plan);
  }, []);

  const closeRestAndAdvance = useCallback(() => {
    pendingAdvanceRef.current?.();
    pendingAdvanceRef.current = null;
    setRestPlan(null);
  }, []);

  /* ---------- 完成一组 / 完成一侧 ---------- */
  const completeSet = useCallback(() => {
    if (!ex || !session || restPlan || transitionNext || rpeTarget) return;
    const sets = Math.max(1, ex.sets);
    const side = ex.unilateral ? (session.side ?? 'L') : null;
    const lastSet = setIndex >= sets - 1;

    if (ex.unilateral && side === 'L') {
      feedback.celebrate('左侧拿下，喘口气');
      openRest(
        {
          seconds: Math.min(60, ex.restSeconds || 60),
          nextLabel: `右侧 第 ${setIndex + 1}/${sets} 组`,
          doneCue: '右侧',
          tip: Math.random() < 0.5 ? `口诀：${ex.mantra}` : `别踩坑：${ex.commonMistakes[0] ?? '动作放慢，姿势优先'}`,
        },
        () => updateSession({ side: 'R' }),
      );
      return;
    }

    if (lastSet) {
      // 全部组数完成（单侧动作此时右侧也做完了）：先弹 RPE 评价，选完/跳过再推进
      setRpeTarget(ex);
      return;
    }

    feedback.celebrate('漂亮，这组拿下');
    openRest(
      {
        seconds: ex.restSeconds,
        nextLabel: `下一组${ex.unilateral ? ' · 左侧' : ''} 第 ${setIndex + 2}/${sets} 组`,
        doneCue: `第 ${setIndex + 2} 组`,
        tip: Math.random() < 0.5 ? `口诀：${ex.mantra}` : `别踩坑：${ex.commonMistakes[0] ?? '动作放慢，姿势优先'}`,
      },
      () => updateSession({ setIndex: setIndex + 1, side: ex.unilateral ? 'L' : null }),
    );
  }, [ex, session, restPlan, transitionNext, rpeTarget, setIndex, feedback, openRest]);

  /* ---------- 完成一个动作的收尾（RPE 评价后调用）：庆祝 + 过场 + 推进/结课 ---------- */
  const advanceAfterExercise = useCallback(
    (withCelebration: boolean) => {
      if (isLastExercise) {
        if (withCelebration) feedback.celebrate('最后一个动作，拿下');
        finishWorkout(skips);
        return;
      }
      const next = exercises[exerciseIndex + 1];
      if (withCelebration) feedback.celebrate('这个动作拿下');
      setTransitionNext(next.name);
      transitionTimerRef.current = setTimeout(() => {
        updateSession({ exerciseIndex: exerciseIndex + 1, setIndex: 0, side: next.unilateral ? 'L' : null });
        setTransitionNext(null);
      }, 700);
    },
    [isLastExercise, feedback, finishWorkout, skips, exercises, exerciseIndex],
  );

  /* 选完即存 + toast 反馈 + 自动收起。toast 位只有一个，评价反馈优先于「这个动作拿下」 */
  const handleRpeSelect = useCallback(
    (rpe: RpeChoice) => {
      const target = rpeTarget;
      setRpeTarget(null);
      if (target) {
        const next = applyRpeOverride(target, rpe);
        vibrate(30);
        feedback.toast(rpeToast(target, next, rpe));
      }
      advanceAfterExercise(false);
    },
    [rpeTarget, feedback, advanceAfterExercise],
  );

  /* 跳过评价：不存记录，照常推进 */
  const handleRpeSkip = useCallback(() => {
    setRpeTarget(null);
    advanceAfterExercise(true);
  }, [advanceAfterExercise]);

  /* ---------- 跳过这个动作 ---------- */
  const confirmSkip = useCallback(() => {
    if (!ex) return;
    setSkipOpen(false);
    const nextSkips = [...skips, { name: ex.name, doneSets: setIndex }];
    setSkips(nextSkips);
    feedback.toast(`跳过了${ex.name}，总结里给你记着`);
    if (isLastExercise) {
      finishWorkout(nextSkips);
      return;
    }
    const next = exercises[exerciseIndex + 1];
    updateSession({ exerciseIndex: exerciseIndex + 1, setIndex: 0, side: next.unilateral ? 'L' : null });
  }, [ex, skips, setIndex, setSkips, feedback, isLastExercise, exercises, exerciseIndex, finishWorkout]);

  /* ---------- 长按撤销一组 ---------- */
  const undoSet = useCallback(() => {
    if (!ex || !session || restPlan) return;
    const side = ex.unilateral ? (session.side ?? 'L') : null;
    if (ex.unilateral && side === 'R') {
      updateSession({ side: 'L' });
    } else if (setIndex > 0) {
      updateSession({ setIndex: setIndex - 1, side: ex.unilateral ? 'L' : null });
    } else {
      return;
    }
    vibrate(30);
    feedback.toast('撤回一组，这组重来');
  }, [ex, session, restPlan, setIndex, feedback]);

  /* ---------- 换替代动作：映射写入 swaps:{date}，组次进度尽量保留，TTS 自动读新动作 ---------- */
  const handleSwap = useCallback(
    (newEx: Exercise) => {
      if (!session) return;
      const newSets = Math.max(1, newEx.sets);
      setSwaps((prev) => ({ ...prev, [exerciseIndex]: newEx.id }));
      updateSession({
        // 已完成组数尽量保留：只有超过新动作组数时才截到最后一组
        setIndex: setIndex >= newSets ? newSets - 1 : setIndex,
        side: newEx.unilateral ? 'L' : null,
      });
      setSwapOpen(false);
      vibrate(30);
      feedback.toast(`换成${newEx.name}了`);
      if (settings.ttsOn && (settings.ttsAuto ?? true)) {
        const seq = ++speakSeqRef.current;
        setSpeaking(true);
        speak(scriptForExercise(newEx), {
          onEnd: () => {
            if (speakSeqRef.current === seq) setSpeaking(false);
          },
        });
      }
    },
    [session, setSwaps, exerciseIndex, setIndex, feedback, settings.ttsOn, settings.ttsAuto],
  );

  /* ---------- 一键换回原动作 ---------- */
  const handleRevertSwap = useCallback(() => {
    if (!session) return;
    const orig = baseExercises[exerciseIndex];
    setSwaps((prev) => {
      const next = { ...prev };
      delete next[exerciseIndex];
      return next;
    });
    if (orig) {
      const origSets = Math.max(1, orig.sets);
      updateSession({
        setIndex: setIndex >= origSets ? origSets - 1 : setIndex,
        side: orig.unilateral ? 'L' : null,
      });
      if (settings.ttsOn && (settings.ttsAuto ?? true)) {
        const seq = ++speakSeqRef.current;
        setSpeaking(true);
        speak(scriptForExercise(orig), {
          onEnd: () => {
            if (speakSeqRef.current === seq) setSpeaking(false);
          },
        });
      }
    }
    setSwapOpen(false);
    feedback.toast('换回原动作');
  }, [session, setSwaps, baseExercises, exerciseIndex, setIndex, feedback, settings.ttsOn, settings.ttsAuto]);

  /* ---------- 热身结束 → 动作一（ttsOn && ttsAuto 时串联播报：提示语 → 动作一要领） ---------- */
  const finishWarmup = useCallback(() => {
    if (!session) return;
    vibrate(120);
    const first = exercises[0];
    if (first && settings.ttsOn && (settings.ttsAuto ?? true)) {
      const seq = ++speakSeqRef.current;
      skipAutoSpeakRef.current = true;
      setSpeaking(true);
      speak('热身完成，进入第一个动作', {
        onEnd: () => {
          if (speakSeqRef.current !== seq) return;
          speak(scriptForExercise(first), {
            onEnd: () => {
              if (speakSeqRef.current === seq) setSpeaking(false);
            },
          });
        },
      });
    }
    updateSession({ exerciseIndex: 0, setIndex: 0, side: first?.unilateral ? 'L' : null });
  }, [session, exercises, settings.ttsOn, settings.ttsAuto]);

  /* ---------- 听要领（手动入口，不受 ttsAuto 限制） ---------- */
  const toggleSpeak = useCallback(() => {
    if (!ex) return;
    if (speaking) {
      speakSeqRef.current += 1;
      cancel();
      setSpeaking(false);
      return;
    }
    if (!settings.ttsOn) {
      feedback.toast('语音开关关着呢，点右上角喇叭打开');
      return;
    }
    const seq = ++speakSeqRef.current;
    setSpeaking(true);
    speak(scriptForExercise(ex), {
      onEnd: () => {
        if (speakSeqRef.current === seq) setSpeaking(false);
      },
    });
  }, [ex, speaking, settings.ttsOn, feedback]);

  /* ---------- 自动滚到底部：让大圆主按钮完整落在屏幕中下部舒适拇指区 ----------
   * 落点：主按钮圆心 ≈ 视口高 68%（中下部拇指区），必要时向下夹取到可滚到底，
   * 保证圆 + label + 次要操作都完整露出（页底已留 20px padding）。 */
  const scrollToPrimaryAction = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>('[data-primary-action]');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const centerY = window.scrollY + rect.top + rect.height / 2;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    const top = Math.min(Math.max(0, Math.round(centerY - vh * 0.68)), maxScroll);
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  }, [reduce]);

  /* 进入训练页 / 切换动作（含热身收尾进动作一）时滚到底部主按钮；
   * 完成一组/换侧（动作下标不变）不滚，避免打断汗手连点。 */
  useEffect(() => {
    const key = phase === 'exercise' ? exerciseIndex : -1;
    if (scrolledKeyRef.current === key) return;
    scrolledKeyRef.current = key;
    const t = setTimeout(scrollToPrimaryAction, 320);
    return () => clearTimeout(t);
  }, [phase, exerciseIndex, scrollToPrimaryAction]);

  /* ---------- 渲染 ---------- */

  if (!meta) {
    /* 休息日 + 无 session：给"想练"一个出口（练一休一是原则，但用户自主） */
    const restNext = today.type === 'rest' ? { workout: today.nextWorkout, lessonNumber: today.nextLessonNumber } : null;
    return (
      <div style={{ paddingTop: 40 }}>
        {feedback.host}
        <div style={{ border: '1px dashed var(--line)', borderRadius: 4, padding: '28px 18px', textAlign: 'center' }}>
          <p className="text-2" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            今天本来是休息日，恢复也很重要。
          </p>
          {restNext ? (
            <p className="text-1" style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
              要练也行：第 {restNext.lessonNumber} 课 · {restNext.workout.subtitle}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {restNext ? (
            <PrimaryButton
              icon={<Icon name="play" size={20} />}
              onClick={() => {
                vibrate(30);
                startSession(restNext.workout.id);
                updateSession({ exerciseIndex: -1, setIndex: 0, side: null, startedAt: Date.now() });
              }}
            >
              今天状态好，就练这节课
            </PrimaryButton>
          ) : null}
          <GhostButton onClick={() => navigate('/')}>回首页</GhostButton>
        </div>
      </div>
    );
  }

  /* 课内进度：含热身 1 格 */
  const totalProgressSets = 1 + exercises.reduce((s, e) => s + Math.max(1, e.sets), 0);
  const doneBefore = exercises.slice(0, exerciseIndex).reduce((s, e) => s + Math.max(1, e.sets), 0);
  const doneProgressSets = phase === 'warmup' ? 0 : 1 + doneBefore + setIndex;
  const progressPct = Math.min(100, (doneProgressSets / totalProgressSets) * 100);

  const exNum = String(exerciseIndex + 2).padStart(2, '0');
  const headerCaption =
    phase === 'warmup'
      ? `第 ${meta.lessonNumber} 课 · ${meta.workout.subtitle} — (01) 热身`
      : `第 ${meta.lessonNumber} 课 · ${meta.workout.subtitle} — (${exNum}) ${ex?.name ?? ''} · 第 ${Math.min(setIndex + 1, Math.max(1, ex?.sets ?? 1))}/${Math.max(1, ex?.sets ?? 1)} 组`;

  /* 当前生效场地（今日选择 > 档案），顶部 Tag 提示 */
  const effectiveVenue: Venue | null = venueToday ?? (profile ? bestVenue(profile.venues) : null);
  const venueTagText = effectiveVenue
    ? venueToday
      ? `今天：${VENUE_TODAY_SHORT[effectiveVenue]}`
      : VENUE_TODAY_SHORT[effectiveVenue]
    : null;

  return (
    <div style={{ touchAction: 'manipulation' }}>
      {feedback.host}

      {/* ===== 顶部固定：进度条 + 课内位置 + 喇叭/退出 ===== */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'var(--bg)',
          marginLeft: -20,
          marginRight: -20,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 8,
        }}
      >
        <div style={{ height: 3, background: 'var(--bg-inset)', borderRadius: 999, overflow: 'hidden' }}>
          <motion.div
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ height: '100%', background: 'var(--accent)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 10px' }}>
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            aria-label="退出训练"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              minHeight: 44,
              padding: '0 8px 0 0',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              fontSize: 14,
              cursor: 'pointer',
              flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon name="arrow-left" size={18} />
            退出
          </button>
          <span
            className="font-display text-2"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              letterSpacing: '0.06em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {headerCaption}
          </span>
          <TTSToggle size={26} />
        </div>
      </div>

      {venueTagText ? (
        <div style={{ marginTop: 8 }}>
          <Tag>{venueTagText}</Tag>
        </div>
      ) : null}

      {resumeHint ? (
        <p className="text-2" style={{ margin: '4px 0 0', fontSize: 13 }}>
          接着上次继续，进度都在。
        </p>
      ) : null}

      {/* ===== 阶段体 ===== */}
      <div style={{ marginTop: 12 }}>
        {phase === 'warmup' ? (
          <WarmupStage warmup={warmup} onFinish={finishWarmup} />
        ) : ex ? (
          <ExerciseStage
            ex={ex}
            exerciseIndex={exerciseIndex}
            exerciseCount={exercises.length}
            setIndex={setIndex}
            side={ex.unilateral ? ((session?.side ?? 'L') as 'L' | 'R') : null}
            weight={weights[ex.id] ?? adjustedBaseKg}
            repsText={adjustedReps(ex, exOverride)}
            adjusted={hasAdjustment(exOverride)}
            weightBump={weightBump}
            onAdjustWeight={(dir) => {
              const spec = weightSpec(ex);
              if (spec.kg === null) return;
              const cur = weights[ex.id] ?? adjustedBaseKg ?? spec.kg;
              setWeights({ ...weights, [ex.id]: clampWeight(cur + dir * spec.step) });
              setWeightBump(dir);
              vibrate(10);
            }}
            speaking={speaking}
            onToggleSpeak={toggleSpeak}
            onCompleteSet={completeSet}
            onUndoSet={undoSet}
            onSkipExercise={() => setSkipOpen(true)}
            canSwap={Boolean(baseExercises[exerciseIndex]?.substitutes?.length)}
            swappedFrom={
              baseExercises[exerciseIndex] && baseExercises[exerciseIndex].id !== ex.id ? baseExercises[exerciseIndex].name : null
            }
            onOpenSwap={() => setSwapOpen(true)}
            reduce={reduce ?? false}
          />
        ) : null}
      </div>

      {/* ===== 全屏组间计时 ===== */}
      <RestTimerOverlay
        open={restPlan !== null}
        seconds={restPlan?.seconds ?? 60}
        nextLabel={restPlan?.nextLabel ?? ''}
        doneCue={restPlan?.doneCue}
        tip={restPlan?.tip}
        onDone={closeRestAndAdvance}
        onSkip={closeRestAndAdvance}
      />

      {/* ===== 动作间过场 ===== */}
      <AnimatePresence>{transitionNext ? <ExerciseTransition key="transition" nextName={transitionNext} /> : null}</AnimatePresence>

      {/* ===== 退出二次确认 ===== */}
      <BottomSheet open={exitOpen} onClose={() => setExitOpen(false)} title="退出训练">
        <p className="text-1" style={{ margin: '4px 0 4px', fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
          练到一半走？
        </p>
        <p className="text-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          进度会保留到今天结束，回来接着练。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          <PrimaryButton onClick={() => setExitOpen(false)}>继续练</PrimaryButton>
          <DangerButton
            onClick={() => {
              setExitOpen(false);
              cancel();
              navigate('/');
            }}
          >
            先撤了
          </DangerButton>
        </div>
      </BottomSheet>

      {/* ===== 跳过动作确认 ===== */}
      <BottomSheet open={skipOpen} onClose={() => setSkipOpen(false)} title="跳过动作">
        <p className="text-1" style={{ margin: '4px 0 4px', fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
          跳过「{ex?.name}」？
        </p>
        <p className="text-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          器械被占了就先跳，总结里会标注，不罚你。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          <PrimaryButton onClick={() => setSkipOpen(false)}>不跳了，接着练</PrimaryButton>
          <GhostButton onClick={confirmSkip}>跳过这个</GhostButton>
        </div>
      </BottomSheet>

      {/* ===== 换替代动作（swaps:{date} 持久化，组次进度尽量保留） ===== */}
      <SubstituteSheet
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        original={baseExercises[exerciseIndex] ?? null}
        current={ex}
        onSwap={handleSwap}
        onRevert={handleRevertSwap}
      />

      {/* ===== RPE 评价（完成一个动作的全部组数后弹出，选完即存） ===== */}
      <RpeSheet open={rpeTarget !== null} exerciseName={rpeTarget?.name ?? ''} onSelect={handleRpeSelect} onSkip={handleRpeSkip} />
    </div>
  );
}


/* ================= 阶段 B：动作卡 ================= */

interface ExerciseStageProps {
  ex: Exercise;
  exerciseIndex: number;
  exerciseCount: number;
  setIndex: number;
  side: 'L' | 'R' | null;
  /** 用户调过的重量 / RPE 调整后重量（null = 用建议值） */
  weight: number | null;
  /** RPE 调整后的次数文案 */
  repsText: string;
  /** 有 RPE 调整量：动作名旁亮「已为你调整」Tag */
  adjusted: boolean;
  /** 重量滚动方向提示 +1/-1 */
  weightBump: number;
  onAdjustWeight: (dir: 1 | -1) => void;
  speaking: boolean;
  onToggleSpeak: () => void;
  onCompleteSet: () => void;
  onUndoSet: () => void;
  onSkipExercise: () => void;
  /** 该位置原动作有替代链：显示「换替代动作」按钮 */
  canSwap: boolean;
  /** 当前动作是替换来的：原动作名（未替换为 null） */
  swappedFrom: string | null;
  onOpenSwap: () => void;
  reduce: boolean;
}

function ExerciseStage({
  ex,
  exerciseIndex,
  exerciseCount,
  setIndex,
  side,
  weight,
  repsText,
  adjusted,
  weightBump,
  onAdjustWeight,
  speaking,
  onToggleSpeak,
  onCompleteSet,
  onUndoSet,
  onSkipExercise,
  canSwap,
  swappedFrom,
  onOpenSwap,
  reduce,
}: ExerciseStageProps): JSX.Element {
  const sets = Math.max(1, ex.sets);
  const currentSetNo = Math.min(setIndex + 1, sets);
  const lastSet = setIndex >= sets - 1;
  const zone = zoneForExercise(ex);
  const wspec = weightSpec(ex);
  const kg = weight ?? wspec.kg;
  const videoUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(ex.videoKeyword)}`;
  const mistakes = ex.commonMistakes.slice(0, 2);

  /* 大圆主按钮文案：当前阶段主操作（纯呈现；完成/换侧/结束状态机仍在父组件 completeSet）。
   * 单侧动作右侧永远在左侧完成后才成为当前侧，天然保证「先左后右」，无需 disabled 右按钮。 */
  const primaryLabel = ex.unilateral
    ? side === 'R'
      ? lastSet
        ? '完成动作'
        : '右侧完成'
      : '左侧完成'
    : lastSet
      ? '完成动作'
      : '完成本组';
  const sideHint = ex.unilateral ? (side === 'R' ? '左侧已做' : '接着右侧 · 先左后右') : undefined;

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
  } as const;

  return (
    <motion.div
      key={`ex-${exerciseIndex}`}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      initial="hidden"
      animate="show"
    >
      {/* 1. 头部 */}
      <motion.div variants={item} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SectionLabel index={String(exerciseIndex + 2).padStart(2, '0')}>动作</SectionLabel>
          <h2 className="font-display text-1" style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {ex.name}
          </h2>
          {adjusted ? (
            <div style={{ marginTop: 8 }}>
              <Tag>已为你调整</Tag>
            </div>
          ) : null}
          {swappedFrom ? (
            <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              已替换：{swappedFrom} → {ex.name}
            </p>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', paddingBottom: 4 }}>
          <div className="text-2" style={{ fontSize: 13 }}>
            第 {exerciseIndex + 1}/{exerciseCount} 个动作
          </div>
          <button
            type="button"
            onClick={onSkipExercise}
            className="text-3"
            style={{ background: 'none', border: 'none', padding: '6px 0 0', fontSize: 13, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            跳过这个 ›
          </button>
        </div>
      </motion.div>

      {/* 2. 单侧横幅（延迟 200ms 落下，引起重视） */}
      {ex.unilateral ? (
        <motion.div
          initial={reduce ? { opacity: 0 } : { y: -8, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
          transition={reduce ? { duration: 0.1 } : { delay: 0.2, duration: 0.25, ease: 'easeOut' }}
          style={{
            marginTop: 14,
            minHeight: 56,
            background: 'var(--warn-dim)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
          }}
        >
          <span style={{ color: 'var(--warn)', display: 'inline-flex', flexShrink: 0 }}>
            <Icon name={side === 'R' ? 'hand-r' : 'hand-l'} size={22} />
          </span>
          <WarnTag>先做左侧</WarnTag>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.5 }}>
            当前：
            <span
              style={{
                color: side !== 'R' ? 'var(--warn)' : 'var(--text-2)',
                borderBottom: side !== 'R' ? '2px solid var(--warn)' : 'none',
                paddingBottom: 1,
              }}
            >
              左侧
            </span>
            <span className="text-3"> / </span>
            <span
              style={{
                color: side === 'R' ? 'var(--warn)' : 'var(--text-2)',
                borderBottom: side === 'R' ? '2px solid var(--warn)' : 'none',
                paddingBottom: 1,
              }}
            >
              右侧
            </span>
            <span className="text-2" style={{ fontSize: 13 }}>
              （第 {currentSetNo}/{sets} 组）
            </span>
          </span>
        </motion.div>
      ) : null}

      {/* 3. 在哪找 */}
      <motion.div variants={item} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          在哪找 · 长什么样
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
          <img
            src={zone.src}
            alt={`${zone.label}线稿图`}
            style={{ width: 96, height: 'auto', display: 'block', borderRadius: 4, flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <Tag>{zone.label}</Tag>
            <p className="text-1 line-clamp-2" style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5 }}>
              {ex.equipment.name} · {ex.equipment.where}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 4. 怎么做 */}
      <motion.div variants={item} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          怎么做
        </div>
        <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ex.steps.map((s, i) => (
            <li key={i} className="text-1" style={{ display: 'flex', gap: 10, fontSize: 17, fontWeight: 500, lineHeight: 1.7 }}>
              <span className="num" style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                {i + 1}.
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </motion.div>

      {/* 5. 邪修口诀 */}
      <motion.div variants={item} style={{ marginTop: 18 }}>
        <div style={{ background: 'var(--accent-dim)', borderRadius: 4, padding: '14px 16px', display: 'flex', gap: 10 }}>
          <span className="font-display" style={{ color: 'var(--accent)', fontSize: 28, lineHeight: 1, flexShrink: 0 }}>
            “
          </span>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: 'var(--accent)' }}>{ex.mantra}</p>
        </div>
      </motion.div>

      {/* 6. 重量行 */}
      <motion.div variants={item} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
            重量
          </span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            {kg !== null ? (
              <>
                <GhostButton
                  fullWidth={false}
                  aria-label="减重量"
                  onClick={() => onAdjustWeight(-1)}
                  style={{ width: 56, minWidth: 56, height: 56, padding: 0 }}
                >
                  <MinusIcon size={20} />
                </GhostButton>
                <span style={{ minWidth: 86, textAlign: 'center', overflow: 'hidden' }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={kg}
                      initial={reduce ? { opacity: 0 } : { y: weightBump >= 0 ? 6 : -6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={reduce ? { opacity: 0 } : { y: weightBump >= 0 ? -6 : 6, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="num"
                      style={{ display: 'inline-block', fontSize: 28, fontWeight: 600, lineHeight: 1, color: 'var(--text-1)' }}
                    >
                      {formatKg(kg)}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <GhostButton
                  fullWidth={false}
                  aria-label="加重量"
                  onClick={() => onAdjustWeight(1)}
                  style={{ width: 56, minWidth: 56, height: 56, padding: 0 }}
                >
                  <Icon name="plus" size={20} />
                </GhostButton>
              </>
            ) : (
              <span className="num text-1" style={{ fontSize: 28, fontWeight: 600 }}>
                自重
              </span>
            )}
          </div>
        </div>
        <p className="text-2" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {wspec.note}
        </p>
      </motion.div>

      {/* 7. 常见错误 */}
      {mistakes.length > 0 ? (
        <motion.div variants={item} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <DangerTag>常见错误</DangerTag>
            <p className="text-1" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, flex: 1 }}>
              {mistakes.map((m) => m.split('：')[0]).join('、')}
            </p>
          </div>
        </motion.div>
      ) : null}

      {/* 8. 组次区 */}
      <motion.div variants={item} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {Array.from({ length: sets }, (_, i) => {
            if (i < setIndex) return <UndoableDot key={i} index={i + 1} onUndo={onUndoSet} />;
            if (i === setIndex) return <SetDot key={i} state="current" index={i + 1} onClick={onCompleteSet} />;
            return <SetDot key={i} state="todo" index={i + 1} />;
          })}
        </div>
        <p className="text-2" style={{ margin: '12px 0 0', fontSize: 13 }}>
          第 {currentSetNo} 组 / 共 {sets} 组 · 组间休 {ex.restSeconds} 秒
          {ex.unilateral ? ` · ${side === 'R' ? '现在做右侧' : '先做左侧'}` : ''}
        </p>
        <p className="text-3" style={{ margin: '4px 0 0', fontSize: 13 }}>
          目标 {repsText}
        </p>
      </motion.div>

      {/* 9. 底部操作区：大圆形主按钮（视觉中心）+ 降级的次要操作（小号文字按钮） */}
      <motion.div variants={item} style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.div
            key={ex.unilateral ? `big-${side ?? 'L'}` : 'big'}
            initial={reduce ? { opacity: 0 } : { scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 320, damping: 20 }}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            <BigActionButton label={primaryLabel} sideHint={sideHint} onPress={onCompleteSet} />
          </motion.div>

          {/* 次要操作：跳过 / 听要领 / 视频 / 换替代动作 —— 降级为小号文字按钮，排在圆下方 */}
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px 20px',
            }}
          >
            <motion.button type="button" whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }} onClick={onSkipExercise} style={SECONDARY_ACTION_STYLE}>
              跳过
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.12 }}
              onClick={onToggleSpeak}
              style={{ ...SECONDARY_ACTION_STYLE, ...(speaking ? { color: 'var(--accent)' } : null) }}
            >
              <span style={{ display: 'inline-flex', flexShrink: 0 }}>{speaking ? <StopIcon size={16} /> : <Icon name="play" size={16} />}</span>
              {speaking ? '停止' : '听要领'}
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.12 }}
              onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')}
              style={SECONDARY_ACTION_STYLE}
            >
              <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                <ExternalIcon size={16} />
              </span>
              视频
            </motion.button>
            {canSwap ? (
              <motion.button type="button" whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }} onClick={onOpenSwap} style={SECONDARY_ACTION_STYLE}>
                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                  <SwapIcon size={16} />
                </span>
                换替代动作
              </motion.button>
            ) : null}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
