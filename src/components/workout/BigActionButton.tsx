/**
 * BigActionButton：训练页底部「大圆形汗手主按钮」。
 * 承载当前阶段主操作（完成本组 / 左侧完成 / 右侧完成 / 完成动作），居中为操作区视觉中心。
 *
 * 规格（对应 workout 主按钮改版需求）：
 * - 圆形直径 88–104px（取 96px），不超过屏宽 1/3，水平居中。
 * - 触控热区 ≥88px：整列（圆 + 下方 label）都是同一个 <button>，热区约 96×148px，误触友好。
 * - 汗手反馈：按下 whileTap scale 0.9（明显的缩放反馈）+ onPointerDown vibrate(10) 触感确认；
 *   完成时的 vibrate(30) 仍由父组件 feedback.celebrate 反馈链触发，二者保持一致、不重复。
 * - 边缘对比：accent 实心圆 + accent-dim 光晕描边，和 --bg 底色反差强。
 * - 颜色全部走 CSS 变量（--accent / --accent-hi / --accent-dim / --on-accent / --text-2），
 *   on-accent 用 --on-accent（主题系统提供的 accent 面深色文字变量），黑/白两主题都成立。
 *
 * 只负责呈现：onPress 由父组件接 completeSet（状态机原逻辑不变）。
 */
import { motion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';
import Icon from '../Icon';
import { vibrate } from '../feedback';

export interface BigActionButtonProps {
  /** 圆下方短文案，如「完成本组」「左侧完成」「完成动作」 */
  label: string;
  /** 主操作回调（父组件接 completeSet） */
  onPress: () => void;
  /** 圆内图标，默认打勾 */
  icon?: ReactNode;
  /** 单侧动作小字提示，如「接着右侧 · 先左后右」（可选） */
  sideHint?: string;
  disabled?: boolean;
}

/** 圆形直径（px）：88–104 区间内，< 屏宽 1/3 */
export const BIG_ACTION_SIZE = 96;

export function BigActionButton({
  label,
  onPress,
  icon,
  sideHint,
  disabled = false,
}: BigActionButtonProps): JSX.Element {
  return (
    <motion.button
      type="button"
      data-primary-action
      aria-label={sideHint ? `${label}，${sideHint}` : label}
      disabled={disabled}
      onClick={onPress}
      onPointerDown={() => {
        if (!disabled) vibrate(10);
      }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={{ duration: 0.12 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 0,
        background: 'none',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {/* 大圆形主按钮（accent 实心 + accent-dim 光晕） */}
      <span
        aria-hidden
        style={{
          width: BIG_ACTION_SIZE,
          height: BIG_ACTION_SIZE,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          boxShadow: '0 0 0 8px var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon ?? <Icon name="check" size={40} strokeWidth={2.5} />}
      </span>
      {/* 圆下方小字 label（随圆一起构成触控热区） */}
      <span
        className="font-display"
        style={{
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.2,
          color: 'var(--text-1)',
          textAlign: 'center',
        }}
      >
        {label}
      </span>
      {sideHint ? (
        <span className="text-2" style={{ fontSize: 12, lineHeight: 1.2, marginTop: -6, textAlign: 'center' }}>
          {sideHint}
        </span>
      ) : null}
    </motion.button>
  );
}

export default BigActionButton;
