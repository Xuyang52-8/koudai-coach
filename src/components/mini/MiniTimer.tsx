/**
 * MiniTimer：日常小练全屏间歇计时器（/mini/:packId 的运行态）。
 * 视觉语言复刻 RestTimerOverlay：--vh 全屏 + .crt 扫描线 + glow-accent 微光
 * + 超大 Oswald tnum 数字 + 2px 进度细线 + 最后 3 秒 warn 变色 + flicker。
 *
 * 交互：
 * - 时间戳法计时（100ms tick，锁屏/切后台不丢进度）
 * - 阶段切换：vibrate(80) + TTS 播报该阶段 cue（"收——"/"放——"/"换，青蛙趴"），不看屏也能练
 * - 阶段最后 3 秒（阶段 >4 秒才生效，3 秒的凯格尔收放全程等同不重复变色）：warn + 每秒 vibrate(30)
 * - 底部大圆形汗手按钮（BigActionButton 复用）：暂停/继续；小号文字按钮"结束练习"（两触点确认）
 * - 顶部：当前轮次 counter（第 3/10 轮）+ 包名；中下：当前阶段名 + hint + 下一个阶段预览
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import Icon from '../Icon';
import { vibrate } from '../feedback';
import BigActionButton from '../workout/BigActionButton';
import { cancel, speak } from '../../lib/tts';
import type { MiniPack } from '../../lib/types';
import { expandTimeline } from './minis';

export interface MiniTimerProps {
  pack: MiniPack;
  /** 全部阶段走完（父组件切到完成态，负责打卡 + 仪式） */
  onFinish: () => void;
  /** 用户主动结束（父组件退出页面） */
  onExit: () => void;
}

const TICK_MS = 100;

/** 暂停图标（图标库无 pause，内联 SVG 与 Icon 同规格：24 viewBox / 2.5 描边 / currentColor） */
const PAUSE_ICON = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="9" y1="5" x2="9" y2="19" />
    <line x1="15" y1="5" x2="15" y2="19" />
  </svg>
);

export function MiniTimer({ pack, onFinish, onExit }: MiniTimerProps): JSX.Element | null {
  const reduce = useReducedMotion();
  const steps = useMemo(() => expandTimeline(pack.phases), [pack]);
  const [stepIdx, setStepIdx] = useState(0);
  const [remainingMs, setRemainingMs] = useState(() => (steps[0]?.phase.secs ?? 1) * 1000);
  const [running, setRunning] = useState(true);
  /** 结束练习两触点确认 */
  const [confirmExit, setConfirmExit] = useState(false);

  const endAtRef = useRef(0);
  const pausedRemainingRef = useRef((steps[0]?.phase.secs ?? 1) * 1000);
  const lastSecRef = useRef(steps[0]?.phase.secs ?? 1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinishRef = useRef(onFinish);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onFinishRef.current = onFinish;
    onExitRef.current = onExit;
  }, [onFinish, onExit]);

  const step = steps[stepIdx] ?? null;
  const nextStep = steps[stepIdx + 1] ?? null;

  const clearIntervalTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /* 主计时循环（时间戳法）。running 开关驱动启停；走完当前阶段 → 推进下一步或通知完成 */
  useEffect(() => {
    if (!running || !step) return;
    endAtRef.current = Date.now() + pausedRemainingRef.current;
    lastSecRef.current = Math.ceil(pausedRemainingRef.current / 1000);
    intervalRef.current = setInterval(() => {
      const rem = Math.max(0, endAtRef.current - Date.now());
      setRemainingMs(rem);
      const sec = Math.ceil(rem / 1000);
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        // 阶段最后 3 秒预警（>4 秒的阶段才有意义；3 秒收放的凯格尔靠切换震动就够）
        if (step.phase.secs > 4 && sec <= 3 && sec >= 1) vibrate(30);
      }
      if (rem <= 0) {
        clearIntervalTimer();
        if (stepIdx + 1 >= steps.length) {
          // 全部走完：停表，通知父组件（完成态仪式由父组件负责）
          setRunning(false);
          onFinishRef.current();
        } else {
          const next = steps[stepIdx + 1];
          pausedRemainingRef.current = next.phase.secs * 1000;
          setRemainingMs(next.phase.secs * 1000);
          setStepIdx(stepIdx + 1);
        }
      }
    }, TICK_MS);
    return () => clearIntervalTimer();
  }, [running, stepIdx, step, steps, clearIntervalTimer]);

  /* 阶段切换（含首次进场）：震动 + TTS 播报 cue —— 不看屏也能练 */
  useEffect(() => {
    if (!step) return;
    vibrate(80);
    speak(step.phase.cue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  /* 卸载兜底：停表 + 停朗读 + 清确认计时 */
  useEffect(
    () => () => {
      clearIntervalTimer();
      cancel();
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [clearIntervalTimer],
  );

  const togglePause = useCallback(() => {
    if (running) {
      pausedRemainingRef.current = Math.max(0, endAtRef.current - Date.now());
      setRemainingMs(pausedRemainingRef.current);
      setRunning(false);
      cancel(); // 暂停时停掉播报
    } else {
      setRunning(true);
    }
  }, [running]);

  const handleExit = useCallback(() => {
    if (!confirmExit) {
      setConfirmExit(true);
      vibrate(15);
      confirmTimerRef.current = setTimeout(() => setConfirmExit(false), 2500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    clearIntervalTimer();
    cancel();
    vibrate(30);
    onExitRef.current();
  }, [confirmExit, clearIntervalTimer]);

  if (!step) return null;

  const phaseSecs = step.phase.secs;
  const sec = Math.ceil(remainingMs / 1000);
  const lastThree = phaseSecs > 4 && sec <= 3;
  const pct = Math.min(100, Math.max(0, (remainingMs / (phaseSecs * 1000)) * 100));
  const numberColor = !running ? 'var(--text-2)' : lastThree ? 'var(--warn)' : 'var(--accent-ink)';

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${pack.name}，${step.phase.name}，剩余 ${sec} 秒`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0.1 } } : { y: '100%', opacity: 1, transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }}
      transition={{ duration: reduce ? 0.1 : 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        height: 'calc(var(--vh, 1vh) * 100)',
        zIndex: 70,
        background: 'var(--bg-inset)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        touchAction: 'manipulation',
      }}
    >
      {/* CRT 扫描线纹理（静态，省电） */}
      <div aria-hidden className="crt" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {/* 数字背后的 accent 径向微光 */}
      <div
        aria-hidden
        className="glow-accent"
        style={{
          position: 'absolute',
          top: '34%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '130vw',
          maxWidth: 560,
          height: '52vh',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 20px',
          paddingTop: 'calc(28px + env(safe-area-inset-top))',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 顶部：轮次计数 · 包名 */}
        <div
          className="font-display font-semibold uppercase"
          style={{ fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-2)', textAlign: 'center' }}
        >
          {step.counter} · {pack.name.replace(/（(男|女)）$/, '')}
        </div>

        {/* 中央：阶段名 + 大数字 + 进度细线 + hint/下一个 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <motion.div
            key={`name-${stepIdx}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.25, ease: 'easeOut' }}
            className="font-display text-1"
            style={{ fontSize: 26, fontWeight: 600, letterSpacing: '0.02em', textAlign: 'center', marginBottom: 8 }}
          >
            {step.phase.name}
          </motion.div>

          <motion.div
            key={`num-${stepIdx}`}
            initial={reduce ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 300, damping: 20 }}
          >
            <motion.div
              key={sec}
              animate={reduce ? undefined : { scale: [1, 1.02, 1] }}
              transition={{ duration: 0.12 }}
              className={`num font-display${lastThree && running ? ' flicker' : ''}`}
              style={{
                fontSize: 'clamp(104px, 30vw, 168px)',
                fontWeight: 700,
                lineHeight: 1,
                color: numberColor,
                textAlign: 'center',
                transition: 'color 200ms',
              }}
            >
              {sec}
            </motion.div>
          </motion.div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)' }}>
            {running ? '秒' : '已暂停'}
          </div>

          {/* 2px 进度细线（宽 60%，当前阶段剩余比例反向消耗） */}
          <div style={{ width: '60%', height: 2, background: 'var(--line)', marginTop: 22, borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: lastThree ? 'var(--warn)' : 'var(--accent)',
                transition: 'width 120ms linear, background-color 200ms',
              }}
            />
          </div>

          {/* 当前阶段小字提示 */}
          {step.phase.hint ? (
            <p
              style={{
                margin: '22px 0 0',
                maxWidth: 300,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-2)',
                textAlign: 'center',
              }}
            >
              {step.phase.hint}
            </p>
          ) : null}
          {/* 下一个阶段预览 */}
          <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
            {nextStep ? `下个：${nextStep.phase.name} · ${nextStep.phase.secs} 秒` : '这是最后一个'}
          </p>
        </div>

        {/* 底部：大圆形暂停/继续 + 小号文字按钮"结束练习" */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <BigActionButton
            label={running ? '暂停' : '继续'}
            onPress={togglePause}
            icon={running ? PAUSE_ICON : <Icon name="play" size={36} />}
          />
          <button
            type="button"
            onClick={handleExit}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '10px 14px',
              fontSize: 13,
              color: confirmExit ? 'var(--warn)' : 'var(--text-3)',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 150ms',
            }}
          >
            {confirmExit ? '再点一次结束（不计入打卡）' : '结束练习'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default MiniTimer;
