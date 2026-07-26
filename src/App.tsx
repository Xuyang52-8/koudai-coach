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
import Cardio from './pages/Cardio'
import Diet from './pages/Diet'
import Library from './pages/Library'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import Welcome from './pages/Welcome'
import Growth from './pages/Growth'
import Equipment from './pages/Equipment'
import { syncReminder } from './lib/notify'
import { useProfile, useSettings } from './lib/store'

/**
 * 首启动闸门：无 profile 的用户（首次启动）一律先去 /welcome 品牌开场页，再进问卷。
 * 只包住非 onboarding/welcome 路由——/onboarding、/welcome 自身不在闸门内，不会重定向死循环。
 */
function OnboardingGate(): JSX.Element {
  const [profile] = useProfile()
  if (!profile) return <Navigate to="/welcome" replace />
  return <Outlet />
}

/**
 * 路由表（嵌套 layout-route 模式：AppShell 渲染 <Outlet/>）
 *  /           今日（首页）
 *  /welcome    品牌开场页（闸门外；无 profile 时 OnboardingGate 重定向到这里）
 *  /onboarding 首次引导问卷（闸门外，/welcome 主按钮进入）
 *  /preview    课前预习
 *  /workout    训练进行（AppShell 在此路径隐藏 TabBar）
 *  /summary    练后总结
 *  /rest       休息日
 *  /mini/:packId 日常小练（全屏间歇计时，AppShell 不为其隐藏 TabBar，计时器自身 fixed 全屏覆盖）
 *  /growth     成长档案（训练日历/力量线/里程碑，TabBar「成长」）
 *  /equipment  我的器械
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
  /* 每日训练提醒对齐：启动时按 settings.notifyOn/notifyTime 排/撤本地通知（网页端 no-op） */
  useEffect(() => {
    syncReminder()
  }, [])
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<OnboardingGate />}>
            <Route path="/" element={<Home />} />
            <Route path="/preview" element={<Preview />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/rest" element={<Rest />} />
            <Route path="/mini/:packId" element={<MiniSession />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/diet" element={<Diet />} />
            <Route path="/cardio" element={<Cardio />} />
            <Route path="/library" element={<Library />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}
