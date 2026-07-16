/**
 * Tag / WarnTag / DangerTag：pill 徽章（accent-dim 底 accent 字等），13px 500，全圆角。
 * 用法：<Tag>3组 × 12次</Tag> <WarnTag>先做左侧</WarnTag> <DangerTag>常见错误</DangerTag>
 */
import type { JSX, ReactNode } from 'react';

type TagTone = 'accent' | 'warn' | 'danger';

const TONE_STYLE: Record<TagTone, { background: string; color: string }> = {
  accent: { background: 'var(--accent-dim)', color: 'var(--accent)' },
  warn: { background: 'var(--warn-dim)', color: 'var(--warn)' },
  danger: { background: 'var(--danger-dim)', color: 'var(--danger)' },
};

export interface TagProps {
  children: ReactNode;
  className?: string;
}

function BaseTag({ tone, children, className }: TagProps & { tone: TagTone }): JSX.Element {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...TONE_STYLE[tone],
      }}
    >
      {children}
    </span>
  );
}

export function Tag(props: TagProps): JSX.Element {
  return <BaseTag tone="accent" {...props} />;
}

export function WarnTag(props: TagProps): JSX.Element {
  return <BaseTag tone="warn" {...props} />;
}

export function DangerTag(props: TagProps): JSX.Element {
  return <BaseTag tone="danger" {...props} />;
}

export default Tag;
