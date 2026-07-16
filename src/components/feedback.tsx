/**
 * 反馈三件套：vibrate(30) + accent 打勾动画 + 一句口语化文案。
 *
 * 用法：
 *   const { vibrate, celebrate, host } = useFeedback();
 *   <button onClick={() => { vibrate(); celebrate('漂亮，这组拿下'); }}>完成</button>
 *   return <>{host}{页面内容}</>   // host 渲染在最外层任意位置即可
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import type { JSX } from 'react';

export function vibrate(ms: number | number[] = 30): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    // 不支持震动的环境静默跳过
  }
}

/** 打勾动画：circle 描画 350ms + check 描画 200ms（延迟 150ms），可单独复用 */
export function CheckDraw({ size = 56 }: { size?: number }): JSX.Element {
  const reduce = useReducedMotion();
  const circleLen = 280; // r=44 的近似周长
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <motion.circle
        cx="50"
        cy="50"
        r="44"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circleLen}
        initial={{ strokeDashoffset: circleLen }}
        animate={{ strokeDashoffset: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.35, ease: 'easeOut' }}
      />
      <motion.path
        d="M32 51.5 45 64 69 38"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="60"
        initial={{ strokeDashoffset: 60 }}
        animate={{ strokeDashoffset: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.2, delay: 0.15, ease: 'easeOut' }}
      />
    </svg>
  );
}

interface Toast {
  id: number;
  text: string;
}

export interface FeedbackApi {
  /** 震动，默认 30ms */
  vibrate: (ms?: number | number[]) => void;
  /** 完成反馈：vibrate(30) + 打勾动画 + 口语文案，自动消失 */
  celebrate: (text: string) => void;
  /** 只弹一句文案，不打勾 */
  toast: (text: string) => void;
  /** 渲染在组件树任意顶层位置 */
  host: JSX.Element;
}

export function useFeedback(): FeedbackApi {
  const reduce = useReducedMotion();
  const [item, setItem] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setItem({ id: Date.now(), text });
    timer.current = setTimeout(() => setItem(null), 1400);
  }, []);

  const celebrate = useCallback(
    (text: string) => {
      vibrate(30);
      show(text);
    },
    [show],
  );

  const host = (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
        zIndex: 90,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {item ? (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.22, ease: 'easeOut' }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg-raised)',
              border: '1px solid var(--line-strong)',
              borderRadius: 4,
              padding: '12px 18px',
              maxWidth: 320,
            }}
          >
            <CheckDraw size={28} />
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1.4 }}>{item.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  return { vibrate, celebrate, toast: show, host };
}

export default useFeedback;
