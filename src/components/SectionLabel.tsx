/**
 * SectionLabel：旅程编号标签 `(01) 热身`
 * Oswald 600 / 13px / +0.14em / uppercase；编号 --text-3，文字 --text-1。
 * 用法：<SectionLabel index="01">热身</SectionLabel> / <SectionLabel index="循环">你的节奏</SectionLabel>
 */
import type { JSX, ReactNode } from 'react';

export interface SectionLabelProps {
  /** 括号里的编号或词，如 "01"、"循环"、"出门前" */
  index: string | number;
  children: ReactNode;
  /** 下方接 1px 短分隔线（宽 32px，--line-strong） */
  withLine?: boolean;
  className?: string;
}

export function SectionLabel({ index, children, withLine = false, className }: SectionLabelProps): JSX.Element {
  return (
    <div className={className}>
      <div
        className="font-display font-semibold uppercase"
        style={{ fontSize: 13, letterSpacing: '0.14em', lineHeight: 1.4 }}
      >
        <span className="text-3">({index})</span>
        <span className="text-1" style={{ marginLeft: 8 }}>
          {children}
        </span>
      </div>
      {withLine ? <div style={{ width: 32, height: 1, background: 'var(--line-strong)', marginTop: 8 }} /> : null}
    </div>
  );
}

export default SectionLabel;
