/**
 * 里程碑墙板块：预设 9 枚里程碑（课数 / 连续打卡 / 首次小练 / 首次三连加重）。
 * 已达成：点亮（accent 描边 + 实心圆章 + 达成日期）；未达成：灰显 + 进度。
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';
import Icon from '../Icon';
import type { IconName } from '../Icon';
import type { MilestoneData, MilestoneKind } from '../../lib/growth';

const KIND_ICON: Record<MilestoneKind, IconName | 'trend'> = {
  lesson: 'dumbbell',
  streak: 'flame',
  mini: 'timer',
  strength: 'trend',
};

/** 上行趋势线小图标（Icon 库没有，本地画同款 24×24 2px 描边） */
function TrendIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function kindIcon(kind: MilestoneKind, size: number): ReactNode {
  const name = KIND_ICON[kind];
  if (name === 'trend') return <TrendIcon size={size} />;
  return <Icon name={name} size={size} />;
}

/** 达成日展示："1月20日达成" */
function reachedLabel(date: string): string {
  return `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日达成`;
}

function MilestoneTile({ m, index }: { m: MilestoneData; index: number }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: m.reached ? 'var(--bg-raised)' : 'transparent',
        border: m.reached ? '1px solid var(--accent)' : '1px dashed var(--line-strong)',
        borderRadius: 4,
        padding: '12px 14px',
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* 圆章 */}
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: m.reached ? 'var(--accent)' : 'transparent',
            border: m.reached ? 'none' : '1px solid var(--line-strong)',
            color: m.reached ? 'var(--on-accent)' : 'var(--text-3)',
          }}
        >
          {m.reached ? <Icon name="check" size={16} strokeWidth={2.5} /> : kindIcon(m.kind, 16)}
        </span>
        <span
          className="font-display font-semibold"
          style={{ fontSize: 17, lineHeight: 1.2, color: m.reached ? 'var(--text-1)' : 'var(--text-2)' }}
        >
          {m.title}
        </span>
      </div>
      {m.reached && m.reachedDate ? (
        <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--accent-ink)' }}>{reachedLabel(m.reachedDate)}</span>
      ) : (
        <span className="text-3" style={{ fontSize: 12, lineHeight: 1.4 }}>
          {m.desc}
        </span>
      )}
      {!m.reached && m.progress ? (
        <span className="num text-3" style={{ fontSize: 12, lineHeight: 1 }}>
          {m.progress.current} / {m.progress.target}
        </span>
      ) : null}
    </motion.div>
  );
}

export interface MilestoneBoardProps {
  milestones: MilestoneData[];
}

export function MilestoneBoard({ milestones }: MilestoneBoardProps): JSX.Element {
  const reachedCount = milestones.filter((m) => m.reached).length;
  return (
    <div style={{ marginTop: 14 }}>
      <p className="text-3" style={{ margin: 0, fontSize: 13 }}>
        已点亮 <span className="num" style={{ color: 'var(--accent-ink)' }}>{reachedCount}</span> / {milestones.length} 枚
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        {milestones.map((m, i) => (
          <MilestoneTile key={m.id} m={m} index={i} />
        ))}
      </div>
    </div>
  );
}

export default MilestoneBoard;
