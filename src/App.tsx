import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { useEffect } from 'react'
import type { JSX } from 'react'
import './App.css'
import AppShell from './components/AppShell'
import Home from './pages/Home'
import Preview from './pages/Preview'
import Workout from './pages/Workout'
import Summary from './pages/Summary'
import Rest from './pages/Rest'
import MiniSession from './pages/MiniSession'
import Diet from './pages/Diet'
import Library from './pages/Library'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import { useProfile, useSettings } from './lib/store'

/**
 * 首启动闸门：无 profile 的用户（首次启动）一律先去 /onboarding 填问卷。
 * 只包住非 onboarding 路由——/onboarding 自身不在闸门内，不会重定向死循环。
 */
function OnboardingGate(): JSX.Element {
  const [profile] = useProfile()
  if (!profile) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

/**
 * 路由表（嵌套 layout-route 模式：AppShell 渲染 <Outlet/>）
 *  /           今日（首页）
 *  /onboarding 首次引导问卷（无 profile 时强制）
 *  /preview    课前预习
 *  /workout    训练进行（AppShell 在此路径隐藏 TabBar）
 *  /summary    练后总结
 *  /rest       休息日
 *  /mini/:packId 日常小练（全屏间歇计时，AppShell 不为其隐藏 TabBar，计时器自身 fixed 全屏覆盖）
 *  /diet       饮食
 *  /library    动作库
 *  /settings   我的/设置
 */
export default function App() {
  const [settings] = useSettings()
  /* 主题同步：settings.theme → <html data-theme>（index.css 变量切换）
     + PWA theme-color meta（黑 #0A0A0B / 白 #FAFAF8，状态栏跟随） */
  useEffect(() => {
    const theme = settings.theme ?? 'dark'
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'light' ? '#FAFAF8' : '#0A0A0B'
  }, [settings.theme])
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<OnboardingGate />}>
            <Route path="/" element={<Home />} />
            <Route path="/preview" element={<Preview />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/rest" element={<Rest />} />
            <Route path="/mini/:packId" element={<MiniSession />} />
            <Route path="/diet" element={<Diet />} />
            <Route path="/library" element={<Library />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
