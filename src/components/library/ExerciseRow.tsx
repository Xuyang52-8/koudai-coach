/**
 * 动作行（收起态 72px）：动作名 + 肌肉 Tag + 组次 Tag +（单侧 WarnTag）+（自建 Tag）+ 展开箭头。
 * 点击打开 ExerciseDetailSheet。
 */
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import Icon from '@/components/Icon';
import Tag, { WarnTag } from '@/components/Tag';
import type { Exercise } from '@/lib/types';

export interface ExerciseRowProps {
  exercise: Exercise;
  isCustom?: boolean;
  onClick: (ex: Exercise) => void;
  /** stagger 入场延迟 */
  delay?: number;
}

export function ExerciseRow({ exercise: ex, isCustom = false, onClick, delay = 0 }: ExerciseRowProps): JSX.Element {
  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(ex)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minHeight: 72,
        padding: '12px 14px',
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="text-1" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>
            {ex.name}
          </span>
          {ex.unilateral ? <WarnTag>先做左侧</WarnTag> : null}
          {isCustom ? <WarnTag>自建</WarnTag> : null}
        </span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag>{ex.muscle}</Tag>
          <Tag>
            {ex.sets}组 × {ex.reps}
          </Tag>
        </span>
      </span>
      <span style={{ flexShrink: 0, color: 'var(--text-3)', display: 'inline-flex', transform: 'rotate(0deg)' }}>
        <Icon name="arrow-right" size={20} />
      </span>
    </motion.button>
  );
}

export default ExerciseRow;
