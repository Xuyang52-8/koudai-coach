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
import type { JSX } from 'react';
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
import { useSkips, useWorkoutExtra } from '../components/workout/extra';
import type { SkipEntry } from '../components/workout/extra';
import { ExternalIcon, MinusIcon, StopIcon } from '../components/workout/icons';
import { warmupSpec } from '../components/workout/warmup';
import { clampWeight, formatKg, weightSpec } from '../components/workout/weight';
import { zoneForExercise } from '../components/workout/zoneImage';
import {
  clearSession,
  getSession,
  startSession,
  todayStr,
  updateSession,
  useCycle,
  useSession,
  useSettings,
  useStoreKey,
} from '../lib/store';
import { cancel, speak } from '../lib/tts';
import type { Exercise } from '../lib/types';
import { estimateWorkoutKcal, getExerciseById, getTodayState, program, resolveWorkout } from '../lib/utils-workout';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ================= 屏幕常亮（失败静默降级） ================= */

function useWakeLock(): void {
  useEffect(() => {
    interface Sentinel {
      release(): Promise<void>;
    }
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };
    let sentinel: Sentinel | null = null;
    const acquire = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          sentinel = s;
        })
        .catch(() => {});
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      sentinel?.release().catch(() => {});
    };
  }, []);
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
  const zone = warmup ? zoneForExercise(warmup) : { src: '/zone-treadmill.svg', label: '有氧区' };

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

export default function Workout(): JSX.Element {
  const navigate = useNavigate();
  const [cycle] = useCycle();
  const [session] = useSession();
  const [settings] = useSettings();
  const feedback = useFeedback();
  const reduce = useReducedMotion();
  useWakeLock();

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

  const baseExercises = useMemo(() => (meta ? resolveWorkout(meta.workout).exercises : []), [meta]);
  const warmup = useMemo(() => (meta ? resolveWorkout(meta.workout).warmup : null), [meta]);

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
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSpeakRef = useRef(false);

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

  /* 离开页面：停朗读、清过场计时 */
  useEffect(
    () => () => {
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

  /* ---------- 进入新动作自动读要领；热身进场读热身脚本 ---------- */
  useEffect(() => {
    if (phase === 'warmup') {
      speak(warmup?.voiceScript ?? '先热身五分钟，让身体热起来。');
      return;
    }
    if (skipAutoSpeakRef.current) {
      // 热身收尾时已手动串联播报，跳过本次自动朗读
      skipAutoSpeakRef.current = false;
      return;
    }
    if (ex) speak(ex.voiceScript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exerciseIndex]);

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
    if (!ex || !session || restPlan || transitionNext) return;
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
      if (isLastExercise) {
        feedback.celebrate('最后一个动作，拿下');
        finishWorkout(skips);
        return;
      }
      const next = exercises[exerciseIndex + 1];
      feedback.celebrate('这个动作拿下');
      setTransitionNext(next.name);
      transitionTimerRef.current = setTimeout(() => {
        updateSession({ exerciseIndex: exerciseIndex + 1, setIndex: 0, side: next.unilateral ? 'L' : null });
        setTransitionNext(null);
      }, 700);
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
  }, [ex, session, restPlan, transitionNext, setIndex, isLastExercise, exerciseIndex, exercises, skips, feedback, openRest, finishWorkout]);

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
      speak(newEx.voiceScript);
    },
    [session, setSwaps, exerciseIndex, setIndex, feedback],
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
      speak(orig.voiceScript);
    }
    setSwapOpen(false);
    feedback.toast('换回原动作');
  }, [session, setSwaps, baseExercises, exerciseIndex, setIndex, feedback]);

  /* ---------- 热身结束 → 动作一 ---------- */
  const finishWarmup = useCallback(() => {
    if (!session) return;
    vibrate(120);
    const first = exercises[0];
    if (first) {
      skipAutoSpeakRef.current = true;
      speak('热身完成，进入第一个动作', { onEnd: () => speak(first.voiceScript) });
    }
    updateSession({ exerciseIndex: 0, setIndex: 0, side: first?.unilateral ? 'L' : null });
  }, [session, exercises]);

  /* ---------- 听要领 ---------- */
  const toggleSpeak = useCallback(() => {
    if (!ex) return;
    if (speaking) {
      cancel();
      setSpeaking(false);
      return;
    }
    if (!settings.ttsOn) {
      feedback.toast('语音开关关着呢，点右上角喇叭打开');
      return;
    }
    setSpeaking(true);
    speak(ex.voiceScript, { onEnd: () => setSpeaking(false) });
  }, [ex, speaking, settings.ttsOn, feedback]);

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
            weight={weights[ex.id] ?? null}
            weightBump={weightBump}
            onAdjustWeight={(dir) => {
              const spec = weightSpec(ex);
              if (spec.kg === null) return;
              const cur = weights[ex.id] ?? spec.kg;
              setWeights({ ...weights, [ex.id]: clampWeight(cur + dir * spec.step) });
              setWeightBump(dir);
              vibrate(10);
            }}
            speaking={speaking}
            onToggleSpeak={toggleSpeak}
            onCompleteSet={completeSet}
            onUndoSet={undoSet}
            onSkipExercise={() => setSkipOpen(true)}
            onLeftFirstHint={() => feedback.toast('先练弱的左边，私教说的。')}
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
  /** 用户调过的重量（null = 用建议值） */
  weight: number | null;
  /** 重量滚动方向提示 +1/-1 */
  weightBump: number;
  onAdjustWeight: (dir: 1 | -1) => void;
  speaking: boolean;
  onToggleSpeak: () => void;
  onCompleteSet: () => void;
  onUndoSet: () => void;
  onSkipExercise: () => void;
  onLeftFirstHint: () => void;
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
  weightBump,
  onAdjustWeight,
  speaking,
  onToggleSpeak,
  onCompleteSet,
  onUndoSet,
  onSkipExercise,
  onLeftFirstHint,
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
          {ex.suggestedWeight}
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
          目标 {ex.reps}
        </p>
      </motion.div>

      {/* 9. 主按钮区（单侧双按钮，右侧在左侧完成前 disabled） */}
      <motion.div variants={item} style={{ marginTop: 20 }}>
        {ex.unilateral ? (
          <motion.div
            key={side ?? 'L'}
            initial={reduce ? { opacity: 0 } : { x: side === 'R' ? 12 : -12, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', gap: 10 }}
          >
            {side === 'R' ? (
              <GhostButton size="lg" disabled icon={<Icon name="check" size={20} />}>
                左侧已做
              </GhostButton>
            ) : (
              <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={onCompleteSet}>
                左侧完成
              </PrimaryButton>
            )}
            {side === 'R' ? (
              <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={onCompleteSet}>
                {lastSet ? '完成这个动作' : '右侧完成'}
              </PrimaryButton>
            ) : (
              <LongPressHint onHint={onLeftFirstHint} style={{ flex: 1 }}>
                <GhostButton size="lg" disabled icon={<Icon name="hand-r" size={20} />} style={{ pointerEvents: 'none' }}>
                  右侧完成
                </GhostButton>
              </LongPressHint>
            )}
          </motion.div>
        ) : (
          <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={onCompleteSet}>
            {lastSet ? '完成这个动作' : `完成第 ${currentSetNo} 组`}
          </PrimaryButton>
        )}
      </motion.div>

      {/* 10. 辅助行（听要领 / 视频 / 换替代动作） */}
      <motion.div variants={item} style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <GhostButton
          size="sm"
          icon={speaking ? <StopIcon size={16} /> : <Icon name="play" size={16} />}
          onClick={onToggleSpeak}
          style={speaking ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        >
          {speaking ? '停止' : '听要领'}
        </GhostButton>
        <GhostButton size="sm" icon={<ExternalIcon size={16} />} onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')}>
          视频
        </GhostButton>
        {canSwap ? (
          <GhostButton size="sm" icon={<SwapIcon size={16} />} onClick={onOpenSwap}>
            换替代动作
          </GhostButton>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/* ================= 长按 disabled 右侧按钮的提示（先左后右铁律） ================= */

function LongPressHint({
  onHint,
  children,
  style,
}: {
  onHint: () => void;
  children: JSX.Element;
  style?: React.CSSProperties;
}): JSX.Element {
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
        timerRef.current = setTimeout(() => {
          vibrate(20);
          onHint();
        }, 400);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      style={{ display: 'inline-flex', touchAction: 'manipulation', ...style }}
    >
      {children}
    </span>
  );
}
