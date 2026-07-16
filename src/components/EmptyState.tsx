/**
 * EmptyState：1px 虚线框（--line）+ caption 文案 + 可选 GhostButton。禁止插画堆砌。
 * 用法：<EmptyState text="还没记录饮食" actionLabel="记一笔" onAction={...} />
 */
import type { JSX } from 'react';
import { GhostButton } from './Buttons';

export interface EmptyStateProps {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ text, actionLabel, onAction, className }: EmptyStateProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 4,
        padding: '28px 18px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', textAlign: 'center' }}>{text}</p>
      {actionLabel && onAction ? (
        <GhostButton size="sm" fullWidth={false} onClick={onAction} style={{ minWidth: 140 }}>
          {actionLabel}
        </GhostButton>
      ) : null}
    </div>
  );
}

export default EmptyState;
