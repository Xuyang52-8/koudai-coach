/**
 * RestTimerOverlay：全屏组间计时（design.md §6.9 · workout.md §B2，本页灵魂）。
 * - fixed 全屏：--bg-inset 底 + .crt 扫描线 + 数字背后 .glow-accent 径向微光
 * - 布局：label「休息中 · {nextLabel}」→ 30vw 超大 tnum 倒计时 → 2px 进度细线 → 三个通栏大按钮
 * - 时间轴基于时间戳（锁屏不丢进度）；暂停/继续、+15秒、跳过
 * - 最后 10 秒：数字 accent→warn + .flicker + speakCountdown 逐秒读秒 + 每秒 vibrate(80)，最后 3 秒震感加强
 * - 结束：数字变「上！」脉冲 → vibrate(120) → TTS「开始第 N 组」→ 下滑 300ms 收起（onDone 由父组件关 open）
 *
 * 结构：外层 AnimatePresence 负责出入场；内层 TimerBody 每次 open 重新挂载，
 * 计时状态在挂载时初始化（免去重置 effect）。
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { GhostButton, PrimaryButton, WarnButton } from './Buttons';
import { vibrate } from './feedback';
import { cancelRestAlarm, scheduleRestAlarm } from '../lib/notify';
import { cancel, speak, speakCountdown } from '../lib/tts';

export interface RestTimerOverlayProps {
  /** 休息总秒数（来自动作 restSeconds） */
  seconds: number;
  /** 是否展开 */
  open: boolean;
  /** label 后半段，如 "下一组 第 3/4 组"、"右侧 第 2/4 组" */
  nextLabel: string;
  /** 计时走完（含「上！」过场）后回调：父组件推进组次并关闭 overlay */
  onDone: () => void;
  /** 用户主动跳过：立即收起（vibrate 30，不语音） */
  onSkip: () => void;
  /** 结束口令片段，如 "第 3 组" / "右侧" → TTS「开始第 3 组」；缺省提示「时间到」 */
  doneCue?: string;
  /** 下组提示（口诀或常见错误，caption 一行） */
  tip?: string;
}

const CN_COUNT: Record<number, string> = {
  10: '十',
  9: '九',
  8: '八',
  7: '七',
  6: '六',
  5: '五',
  4: '四',
  3: '三',
  2: '二',
  1: '一',
};

const TICK_MS = 100;
/** 「上！」过场停留时长（含 scale 脉冲 300ms） */
const DONE_BEAT_MS = 750;

export function RestTimerOverlay(props: RestTimerOverlayProps): JSX.Element {
  return <AnimatePresence>{props.open ? <TimerBody key="rest-timer" {...props} /> : null}</AnimatePresence>;
}

/* ================= 计时主体（open 时挂载，关闭后随出场动画卸载） ================= */

function TimerBody({ seconds, nextLabel, onDone, onSkip, doneCue, tip }: RestTimerOverlayProps): JSX.Element {
  const reduce = useReducedMotion();
  const total0 = Math.max(1, seconds) * 1000;
  const [remainingMs, setRemainingMs] = useState(total0);
  const [totalMs, setTotalMs] = useState(total0);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);

  const endAtRef = useRef(0);
  /** 非运行态下的剩余毫秒（运行态以 endAtRef 为准） */
  const pausedRemainingRef = useRef(total0);
  const lastSecRef = useRef(Math.max(1, seconds));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onDoneRef.current = onDone;
    onSkipRef.current = onSkip;
  }, [onDone, onSkip]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  }, []);

  /** 计时走完：上！→ 震动 → TTS → 通知父组件收起（前台走完，撤掉系统双保险） */
  const finish = useCallback(() => {
    clearTimers();
    void cancelRestAlarm();
    setFinished(true);
    setRunning(false);
    vibrate(120);
    speak(doneCue ? `开始${doneCue}` : '休息时间到，开始吧');
    doneTimerRef.current = setTimeout(() => onDoneRef.current(), DONE_BEAT_MS);
  }, [clearTimers, doneCue]);

  /* 双保险（v1.5）：挂载即预约系统通知——切后台聊天/锁屏/被杀，系统闹钟照样喊"该上了" */
  useEffect(() => {
    void scheduleRestAlarm(Math.max(1, seconds), doneCue ? `开始${doneCue}` : nextLabel);
    return () => {
      void cancelRestAlarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 主计时循环（时间戳法，锁屏/切后台不丢进度）。running 开关驱动启停。 */
  useEffect(() => {
    if (!running || finished) return;
    endAtRef.current = Date.now() + pausedRemainingRef.current;
    lastSecRef.current = Math.ceil(pausedRemainingRef.current / 1000);
    intervalRef.current = setInterval(() => {
      const rem = Math.max(0, endAtRef.current - Date.now());
      setRemainingMs(rem);
      const sec = Math.ceil(rem / 1000);
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        if (sec <= 10 && sec >= 1) {
          speakCountdown(CN_COUNT[sec] ?? String(sec));
          // 最后 3 秒震感加强
          vibrate(sec <= 3 ? [80, 40, 80] : 80);
        }
      }
      if (rem <= 0) finish();
    }, TICK_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, finished, finish]);

  /* 卸载兜底：停表 */
  useEffect(() => () => clearTimers(), [clearTimers]);

  const togglePause = useCallback(() => {
    if (finished) return;
    if (running) {
      pausedRemainingRef.current = Math.max(0, endAtRef.current - Date.now());
      setRemainingMs(pausedRemainingRef.current);
      setRunning(false);
      cancel(); // 暂停时停掉读秒
    } else {
      setRunning(true);
    }
    vibrate(10);
  }, [running, finished]);

  const addFifteen = useCallback(() => {
    if (finished) return;
    setTotalMs((t) => t + 15000);
    if (running) {
      endAtRef.current += 15000;
      setRemainingMs(Math.max(0, endAtRef.current - Date.now()));
      // 双保险同步顺延
      void scheduleRestAlarm(Math.ceil(Math.max(0, endAtRef.current - Date.now()) / 1000), doneCue ? `开始${doneCue}` : nextLabel);
    } else {
      pausedRemainingRef.current += 15000;
      setRemainingMs(pausedRemainingRef.current);
    }
    vibrate(10);
  }, [running, finished, doneCue, nextLabel]);

  const handleSkip = useCallback(() => {
    clearTimers();
    cancel();
    vibrate(30);
    onSkipRef.current();
  }, [clearTimers]);

  const sec = Math.ceil(remainingMs / 1000);
  const lastTen = !finished && sec <= 10;
  const pct = totalMs > 0 ? Math.min(100, Math.max(0, (remainingMs / totalMs) * 100)) : 0;
  const numberColor = finished ? 'var(--accent-hi)' : !running ? 'var(--text-2)' : lastTen ? 'var(--warn)' : 'var(--accent-ink)';

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`休息中，${nextLabel}`}
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

      {/* safe-top/safe-bottom：状态栏+手势条安全区（基础顶/底距 20px，见 index.css） */}
      <div
        className="safe-top safe-bottom"
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 20,
          paddingRight: 20,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* label */}
        <div
          className="font-display font-semibold uppercase"
          style={{ fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-2)', textAlign: 'center' }}
        >
          休息中 · {nextLabel}
        </div>

        {/* 倒计时大数字 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 300, damping: 20 }}
          >
            {finished ? (
              <motion.div
                key="go"
                initial={reduce ? { opacity: 0 } : { scale: 0.9 }}
                animate={reduce ? { opacity: 1 } : { scale: [0.9, 1.1, 1], opacity: 1 }}
                transition={{ duration: reduce ? 0.1 : 0.3, ease: 'easeOut' }}
                className="font-display"
                style={{
                  fontSize: 'clamp(84px, 24vw, 140px)',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'var(--accent-hi)',
                  textAlign: 'center',
                }}
              >
                上！
              </motion.div>
            ) : (
              <motion.div
                key={sec}
                animate={reduce ? undefined : { scale: [1, 1.02, 1] }}
                transition={{ duration: 0.12 }}
                className={`num font-display${lastTen && running ? ' flicker' : ''}`}
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
            )}
          </motion.div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)' }}>
            {finished ? (doneCue ? `开始${doneCue}` : '开始吧') : '秒'}
          </div>

          {/* 2px 进度细线（宽 60%，剩余比例反向消耗） */}
          <div style={{ width: '60%', height: 2, background: 'var(--line)', marginTop: 22, borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: lastTen ? 'var(--warn)' : 'var(--accent)',
                transition: 'width 120ms linear, background-color 200ms',
              }}
            />
          </div>

          {/* 下组提示 */}
          {tip ? (
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
              {tip}
            </p>
          ) : null}
        </div>

        {/* 三个通栏大按钮（汗手 ≥56px） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PrimaryButton size="lg" onClick={togglePause} disabled={finished}>
            {running ? '暂停' : '继续'}
          </PrimaryButton>
          <GhostButton onClick={addFifteen} disabled={finished} right={<span className="num">15s</span>}>
            +15秒
          </GhostButton>
          <WarnButton onClick={handleSkip}>跳过休息</WarnButton>
        </div>
      </div>
    </motion.div>
  );
}

export default RestTimerOverlay;
