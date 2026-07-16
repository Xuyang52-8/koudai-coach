/**
 * ScreenHeader：label 编号标签 → display 大标题 → 右侧操作位。
 * 每个页面自己渲染一个，放在页面内容最顶部（AppShell 的内容插槽内）。
 * 用法：
 *   <ScreenHeader label="口袋私教 · POCKET COACH" title="今天练什么"
 *     actions={<><StreakBadge/><TTSToggle/></>} />
 */
import type { JSX, ReactNode } from 'react';

export interface ScreenHeaderProps {
  /** Oswald 13px 小标签，--text-3，可省略 */
  label?: string;
  /** display 大标题 32px 700 */
  title: string;
  /** 右侧操作位（streak 徽章 / TTSToggle / "+ 自建" 等） */
  actions?: ReactNode;
}

export function ScreenHeader({ label, title, actions }: ScreenHeaderProps): JSX.Element {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        paddingTop: 20,
        paddingBottom: 20,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {label ? (
          <div
            className="font-display font-semibold uppercase text-3"
            style={{ fontSize: 13, letterSpacing: '0.14em', lineHeight: 1.4, marginBottom: 4 }}
          >
            {label}
          </div>
        ) : null}
        <h1
          className="font-display text-1"
          style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }}
        >
          {title}
        </h1>
      </div>
      {actions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingBottom: 4 }}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export default ScreenHeader;
