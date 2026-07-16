/**
 * 训练流程组补充图标（Icon.tsx 里没有的：minus / stop / chevron-down / external）。
 * 风格对齐 Icon.tsx：24×24 viewBox · 2px 描边 · currentColor。不用 emoji。
 */
import type { JSX } from 'react';

export interface MiniIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function MiniSvg({ size = 24, strokeWidth = 2, className, children }: MiniIconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** 减号（重量步进器 −） */
export function MinusIcon(props: MiniIconProps): JSX.Element {
  return (
    <MiniSvg {...props}>
      <path d="M5 12h14" />
    </MiniSvg>
  );
}

/** 方块停止（听要领朗读中） */
export function StopIcon(props: MiniIconProps): JSX.Element {
  return (
    <MiniSvg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
    </MiniSvg>
  );
}

/** 向下展开箭头（手风琴） */
export function ChevronDownIcon(props: MiniIconProps): JSX.Element {
  return (
    <MiniSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </MiniSvg>
  );
}

/** 外链 ↗（B 站视频搜索） */
export function ExternalIcon(props: MiniIconProps): JSX.Element {
  return (
    <MiniSvg {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    </MiniSvg>
  );
}
