import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { unlockTTS } from './lib/tts'

// 首次触摸/点击即解锁移动端 TTS（iOS/安卓语音需用户手势激活）
window.addEventListener('pointerdown', unlockTTS, { once: true })

// --vh 视口高修正：手机浏览器地址栏伸缩时保持全屏页尺寸正确
function updateVh() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
}
updateVh()
window.addEventListener('resize', updateVh)
window.addEventListener('orientationchange', updateVh)

// PWA Service Worker（autoUpdate：有新版本自动刷新）
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(<App />)
