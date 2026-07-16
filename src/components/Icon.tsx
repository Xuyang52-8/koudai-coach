/**
 * 内联 SVG 图标库：24×24 viewBox · 2px 描边 · currentColor
 * 与 public/icon-sprite.svg 同源。禁止 emoji 当图标。
 * 用法：<Icon name="flame" /> / <Icon name="dumbbell" size={20} />
 */
import type { JSX, ReactNode } from 'react';

export type IconName =
  | 'flame'
  | 'tts-on'
  | 'tts-off'
  | 'check-circle'
  | 'check'
  | 'plus'
  | 'camera'
  | 'mic'
  | 'arrow-right'
  | 'arrow-left'
  | 'timer'
  | 'dumbbell'
  | 'droplet'
  | 'hand-l'
  | 'hand-r'
  | 'waves'
  | 'walk'
  | 'stretch'
  | 'export'
  | 'trash'
  | 'key'
  | 'book'
  | 'play'
  | 'bowl'
  | 'user';

const PATHS: Record<IconName, ReactNode> = {
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  'tts-on': (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  'tts-off': (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v3" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  timer: (
    <>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 14l2.8-2.8" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6.8 12h10.4" />
      <rect x="2" y="8" width="2.8" height="8" rx="0.5" />
      <rect x="19.2" y="8" width="2.8" height="8" rx="0.5" />
      <rect x="5.2" y="9.6" width="1.9" height="4.8" rx="0.5" />
      <rect x="16.9" y="9.6" width="1.9" height="4.8" rx="0.5" />
    </>
  ),
  droplet: (
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  ),
  'hand-l': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
        fontFamily="Oswald, sans-serif"
      >
        L
      </text>
    </>
  ),
  'hand-r': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
        fontFamily="Oswald, sans-serif"
      >
        R
      </text>
    </>
  ),
  waves: (
    <>
      <path d="M2 8q2.5-3 5 0t5 0t5 0t5 0" />
      <path d="M2 15q2.5-3 5 0t5 0t5 0t5 0" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.3" r="2" />
      <path d="M13 7l-2.4 5.4" />
      <path d="M10.6 12.4 8 18.6" />
      <path d="M10.6 12.4l3.1 3.4.6 4.2" />
      <path d="M12.8 8.6 9.2 10.4" />
      <path d="M12.8 8.6 16.2 11" />
    </>
  ),
  stretch: (
    <>
      <circle cx="9.5" cy="4.6" r="2" />
      <path d="M9.5 7v6" />
      <path d="M9.5 13l-3 7" />
      <path d="M9.5 13l3 7" />
      <path d="M9.5 9c2.2-3 5.4-3.8 8.5-2.6" />
    </>
  ),
  export: (
    <>
      <path d="M12 14V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="16" r="4" />
      <path d="m11 13 9-9" />
      <path d="m15.5 8.5 2.5 2.5" />
      <path d="m18 6 2 2" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  play: <path d="M7.5 4.8v14.4L19 12z" fill="currentColor" stroke="none" />,
  bowl: (
    <>
      <path d="M4 13h16a8 8 0 0 1-16 0z" />
      <path d="M9.5 9.5c0-1.6 1.2-1.6 1.2-3.2" />
      <path d="M13.5 9.5c0-1.6 1.2-1.6 1.2-3.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c1.6-3.8 4.7-5.3 7.5-5.3s5.9 1.5 7.5 5.3" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** 边长 px，默认 24 */
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 24, strokeWidth = 2, className }: IconProps): JSX.Element {
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
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
