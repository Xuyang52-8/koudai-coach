/**
 * 品牌开场页（/welcome）—— 首次打开的 3 秒品牌瞬间。
 * 黑底（var(--bg)，白天模式自动转暖白）+ 薄荷绿哑铃 logo +「口袋私教」+ 一句话主张，
 * 主按钮直进问卷。动画克制：logo 先出，标题 / 副文 / 按钮依次上浮；
 * prefers-reduced-motion 降级为纯淡入。全 CSS 变量，黑白双主题兼容。
 * 页面自身 fixed 全屏（z-80），盖住 AppShell 内容与 TabBar，不依赖壳的隐藏逻辑。
 *
 * 接线说明（本任务不改 App.tsx，由主代理接线）：
 *   1. 路由：App.tsx 顶部 `import Welcome from './pages/Welcome'`，
 *      在 <Route element={<AppShell />}> 内、OnboardingGate 之外加
 *      <Route path="/welcome" element={<Welcome />} />。
 *   2. 首启动重定向：OnboardingGate 改为 profile 为空时
 *      `return <Navigate to="/welcome" replace />`；
 *      /welcome 在闸门外，不会重定向死循环，主按钮再 navigate('/onboarding') 进问卷。
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { PrimaryButton } from '../components/Buttons';
import { vibrate } from '../components/feedback';
import Icon from '../components/Icon';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Welcome(): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <div
      className="safe-top safe-bottom"
      style={{
        position: 'fixed',
        inset: 0,
        height: 'calc(var(--vh, 1vh) * 100)',
        zIndex: 80,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 20,
        paddingRight: 20,
        textAlign: 'center',
        touchAction: 'manipulation',
      }}
    >
      {/* 薄荷绿哑铃 logo：先出（spring 到位，一次不循环） */}
      <motion.img
        src="./app-icon.svg"
        alt="口袋私教哑铃 logo"
        width={96}
        height={96}
        initial={reduce ? { opacity: 0 } : { scale: 0.72, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 260, damping: 18 }}
        style={{ borderRadius: 22, display: 'block' }}
      />

      {/* 品牌名 */}
      <motion.h1
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.45, delay: 0.18, ease: EASE_OUT }}
        className="font-display text-1"
        style={{ margin: '26px 0 0', fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}
      >
        口袋私教
      </motion.h1>

      {/* 一句话主张 */}
      <motion.p
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.45, delay: 0.32, ease: EASE_OUT }}
        className="text-2"
        style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.6 }}
      >
        健身房里跟着走就行的私教
      </motion.p>

      {/* 主按钮 + 承诺小字 */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.45, delay: 0.48, ease: EASE_OUT }}
        style={{ width: '100%', maxWidth: 320, marginTop: 56, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <PrimaryButton
          size="lg"
          icon={<Icon name="arrow-right" size={20} />}
          onClick={() => {
            vibrate(30);
            navigate('/onboarding');
          }}
        >
          开始定制我的课表
        </PrimaryButton>
        <div className="text-3" style={{ fontSize: 13 }}>
          3 分钟填完，永久保存
        </div>
      </motion.div>
    </div>
  );
}
