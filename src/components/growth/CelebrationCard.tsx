/**
 * 新里程碑庆祝卡：Growth 页顶部弹出（framer-motion 弹性入场 + CRT + accent 微光）。
 * 文案取里程碑的 celebrate（如「第 10 课达成，你不是新手了」），点「收下」关闭并标记已见。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import type { JSX } from 'react';
import { PrimaryButton } from '../Buttons';
import Icon from '../Icon';
import { vibrate } from '../feedback';
import type { MilestoneData } from '../../lib/growth';

export interface CelebrationCardProps {
  milestone: MilestoneData;
  onDismiss: () => void;
}

export function CelebrationCard({ milestone, onDismiss }: CelebrationCardProps): JSX.Element {
  const reduce = useReducedMotion();

  useEffect(() => {
    vibrate([60, 40, 60]);
  }, []);

  return (
    <motion.section
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
      transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 320, damping: 22 }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-raised)',
        border: '1px solid var(--accent)',
        borderRadius: 4,
        marginBottom: 24,
      }}
    >
      {/* 顶部 3px accent 实线 */}
      <div style={{ height: 3, background: 'var(--accent)' }} />
      <div aria-hidden className="crt" style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 120, opacity: 0.9, pointerEvents: 'none' }} />
      <div
        aria-hidden
        className="glow-accent"
        style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 320, height: 200, pointerEvents: 'none' }}
      />
      <div style={{ position: 'relative', padding: 18 }}>
        <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          (新) 里程碑达成
        </div>
        <h2
          className="font-display"
          style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, color: 'var(--accent-ink)' }}
        >
          {milestone.celebrate}
        </h2>
        {milestone.reachedDate ? (
          <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {Number(milestone.reachedDate.slice(5, 7))} 月 {Number(milestone.reachedDate.slice(8, 10))} 日 · 已刻上里程碑墙
          </p>
        ) : null}
        <div style={{ marginTop: 14 }}>
          <PrimaryButton
            size="md"
            fullWidth={false}
            icon={<Icon name="check" size={18} />}
            onClick={() => {
              vibrate(30);
              onDismiss();
            }}
            style={{ minWidth: 140 }}
          >
            收下
          </PrimaryButton>
        </div>
      </div>
    </motion.section>
  );
}

export default CelebrationCard;
