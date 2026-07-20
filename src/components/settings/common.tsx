/**
 * 设置页共享小件：Panel 面板 / PanelRow 行 / Caption 小字 / GroupHeader 组分隔标题。
 * 三组信息架构（常用 / 训练 / 高级）靠 GroupHeader 分隔；颜色全走 CSS 变量，黑白主题都成立。
 */
import { motion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';
import Icon from '@/components/Icon';

/** 面板（行间 1px 分隔线） */
export function Panel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: '4px 18px',
      }}
    >
      {children}
    </div>
  );
}

export function PanelRow({ children, last = false }: { children: ReactNode; last?: boolean }): JSX.Element {
  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: last ? 'none' : '1px solid var(--line)',
      }}
    >
      {children}
    </div>
  );
}

/** 行内说明小字 */
export function Caption({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

export interface GroupHeaderProps {
  /** 组序号，如 "01" */
  index: string;
  title: string;
  /** 第一组（页首）时收紧上间距 */
  first?: boolean;
  /** 折叠模式：整行可点，右侧箭头旋转指示 */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  /** 折叠态下箭头左侧的一行内容提示，如 "API · 备份 · 清空" */
  hint?: string;
}

/** 组分隔标题：`01 / 常用` + 延伸分隔线；collapsible 时整行可点展开/收起 */
export function GroupHeader({ index, title, first = false, collapsible = false, open = true, onToggle, hint }: GroupHeaderProps): JSX.Element {
  const inner = (
    <>
      <span
        className="font-display font-bold uppercase"
        style={{ fontSize: 18, letterSpacing: '0.12em', color: 'var(--text-1)', whiteSpace: 'nowrap' }}
      >
        <span className="text-3">{index} / </span>
        {title}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--line-strong)' }} aria-hidden="true" />
      {collapsible ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
          {!open && hint ? <span style={{ fontSize: 12 }}>{hint}</span> : null}
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ display: 'inline-flex' }}
            aria-hidden="true"
          >
            <Icon name="arrow-right" size={16} />
          </motion.span>
        </span>
      ) : null}
    </>
  );

  const rowStyle = {
    width: '100%',
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '6px 2px',
  } as const;

  return (
    <div style={{ marginTop: first ? 20 : 36, marginBottom: 4 }}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          style={{
            ...rowStyle,
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {inner}
        </button>
      ) : (
        <div style={rowStyle}>{inner}</div>
      )}
    </div>
  );
}
