/**
 * AppShell：应用骨架（嵌套路由 layout-route 模式，渲染 <Outlet/>）。
 * - 内容插槽：页面自己渲染 ScreenHeader + 内容（水平 20px padding 由壳提供）
 * - 底部 TabBar 5 项：今日/训练/饮食/动作库/我的（/ /preview /diet /library /settings）
 *   高 64px + safe-area；当前项 accent + 顶部 2px accent 短横指示
 * - 训练进行中（/workout 路径）TabBar 隐藏，防误触跳出
 * - 容器 max-width 480px 居中
 */
import type { JSX } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '今日', icon: 'flame', end: true },
  { to: '/preview', label: '训练', icon: 'dumbbell' },
  { to: '/diet', label: '饮食', icon: 'bowl' },
  { to: '/library', label: '动作库', icon: 'book' },
  { to: '/settings', label: '我的', icon: 'user' },
];

export const TAB_BAR_HEIGHT = 64;

function TabBar(): JSX.Element {
  return (
    <nav
      aria-label="主导航"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        height: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'var(--bg-raised)',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        zIndex: 60,
      }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          style={({ isActive }) => ({
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--text-3)',
            WebkitTapHighlightColor: 'transparent',
          })}
        >
          {({ isActive }) => (
            <>
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 24,
                  height: 2,
                  borderRadius: 999,
                  background: isActive ? 'var(--accent)' : 'transparent',
                }}
              />
              <Icon name={tab.icon} size={22} />
              <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1 }}>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell(): JSX.Element {
  const location = useLocation();
  const hideTabBar = location.pathname.startsWith('/workout');
  return (
    <div
      style={{
        minHeight: 'calc(var(--vh, 1vh) * 100)',
        maxWidth: 480,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <main
        style={{
          flex: 1,
          padding: '0 20px',
          paddingBottom: hideTabBar ? 20 : `calc(${TAB_BAR_HEIGHT + 24}px + env(safe-area-inset-bottom))`,
        }}
      >
        <Outlet />
      </main>
      {hideTabBar ? null : <TabBar />}
    </div>
  );
}

export default AppShell;
