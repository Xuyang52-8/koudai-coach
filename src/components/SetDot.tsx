/**
 * SetDot：组次圆点，直径 40px，三态。
 *  - todo：1px --line-strong 描边 + --text-3 数字
 *  - current：accent 2px 描边 + accent 数字 + accent-dim 光晕
 *  - done：accent 实心 + #060607 打勾
 * 用法：<SetDot state="current" index={2} />（index 从 1 开始显示）
 */
import { motion } from 'framer-motion';
import type { CSSProperties, JSX } from 'react';
import { Icon } from './Icon';

export type SetDotState = 'todo' | 'current' | 'done';

export interface SetDotProps {
  state: SetDotState;
  /** 显示的数字（1 起始），done 态显示打勾 */
  index: number;
  onClick?: () => void;
  className?: string;
}

export function SetDot({ state, index, onClick, className }: SetDotProps): JSX.Element {
  const style: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 16,
    flexShrink: 0,
    border: state === 'done' ? 'none' : state === 'current' ? '2px solid var(--accent)' : '1px solid var(--line-strong)',
    background: state === 'done' ? 'var(--accent)' : state === 'current' ? 'var(--accent-dim)' : 'transparent',
    color: state === 'done' ? '#060607' : state === 'current' ? 'var(--accent)' : 'var(--text-3)',
    boxShadow: state === 'current' ? '0 0 0 6px var(--accent-dim)' : 'none',
    cursor: onClick ? 'pointer' : 'default',
    WebkitTapHighlightColor: 'transparent',
  };
  const content =
    state === 'done' ? (
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        style={{ display: 'inline-flex' }}
      >
        <Icon name="check" size={18} strokeWidth={2.5} />
      </motion.span>
    ) : (
      <span className="num">{index}</span>
    );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style} className={className} aria-label={`第 ${index} 组`}>
        {content}
      </button>
    );
  }
  return (
    <span style={style} className={className}>
      {content}
    </span>
  );
}

export default SetDot;
