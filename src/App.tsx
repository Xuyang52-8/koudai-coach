import { BrowserRouter, Route, Routes } from 'react-router'
import './App.css'
import AppShell from './components/AppShell'
import Home from './pages/Home'
import Preview from './pages/Preview'
import Workout from './pages/Workout'
import Summary from './pages/Summary'
import Rest from './pages/Rest'
import Diet from './pages/Diet'
import Library from './pages/Library'
import Settings from './pages/Settings'

/**
 * 路由表（嵌套 layout-route 模式：AppShell 渲染 <Outlet/>）
 *  /          今日（首页，已实现）
 *  /preview   课前预习（stub → 页面代理替换）
 *  /workout   训练进行（stub，AppShell 在此路径隐藏 TabBar）
 *  /summary   练后总结（stub）
 *  /rest      休息日（stub）
 *  /diet      饮食（stub）
 *  /library   动作库（stub）
 *  /settings  我的/设置（stub）
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/preview" element={<Preview />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/rest" element={<Rest />} />
          <Route path="/diet" element={<Diet />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
