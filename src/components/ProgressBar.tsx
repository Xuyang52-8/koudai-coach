/**
 * ProgressBar：轨道 10px 全圆角（--bg-inset），填充 accent（超标 warn），600ms 动画。
 * 右端 num-md 当前值 + caption 目标值。不用任何图表库。
 * 用法：<ProgressBar value={1450} max={2250} unit="大卡" />
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';

export interface ProgressBarProps {
  value: number;
  max: number;
  /** 数字后的单位/说明，如 "大卡" "g 蛋白" */
  unit?: string;
  /** 隐藏右侧数字 */
  hideNumbers?: boolean;
  className?: string;
}

export function ProgressBar({ value, max, unit, hideNumbers = false, className }: ProgressBarProps): JSX.Element {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        style={{
          flex: 1,
          height: 10,
          borderRadius: 999,
          background: 'var(--bg-inset)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={
            reduce ? { duration: 0.1 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
          }
          style={{
            height: '100%',
            borderRadius: 999,
            background: over ? 'var(--warn)' : 'var(--accent)',
          }}
        />
      </div>
      {hideNumbers ? null : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          <span
            className="num"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 24,
              lineHeight: 1,
              color: over ? 'var(--warn)' : 'var(--text-1)',
            }}
          >
            {Math.round(value)}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
            / {Math.round(max)}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
