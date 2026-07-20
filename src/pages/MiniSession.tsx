/**
 * 日常小练页（/mini/:packId）：三态
 * - intro：包说明 + 教学卡（凯格尔"先找到对的肌肉"）+ 内容清单 + 注意事项 + 开始按钮
 * - run：MiniTimer 全屏间歇计时（震动 + TTS cue，不看屏也能练）
 * - done：打勾仪式 + "已计入连续打卡" + streak 天数（completeMini 写入 minis:{date}）
 *
 * 复用：BigActionButton（计时器内）、useWakeLock、useBgAudioKeepAlive（artist=包名）、
 * CheckDraw 打勾仪式、speak/vibrate 反馈链。凯格尔按 profile.gender 兜底重定向。
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import Tag, { WarnTag } from '../components/Tag';
import { CheckDraw, vibrate } from '../components/feedback';
import MiniTimer from '../components/mini/MiniTimer';
import { getMiniPack, miniDisplayName } from '../components/mini/minis';
import { useBgAudioKeepAlive } from '../lib/keepalive';
import { completeMini, useCycle, useMinisCompleted, useProfile, useSettings } from '../lib/store';
import { speak } from '../lib/tts';
import { useWakeLock } from '../lib/wakelock';
import type { MiniPack } from '../lib/types';

type Stage = 'intro' | 'run' | 'done';

/** 内容清单：阶段组 → 一行行可读序列（含循环轮数） */
function outlineLines(pack: MiniPack): string[] {
  return pack.phases.map((g) => {
    const rounds = Math.max(1, g.rounds ?? 1);
    const seq = g.phases.map((p) => `${p.name} ${p.secs} 秒`).join(' / ');
    return rounds > 1 ? `${seq} × ${rounds} 轮` : seq;
  });
}

export default function MiniSession(): JSX.Element {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [profile] = useProfile();
  const [settings] = useSettings();
  const [cycle] = useCycle();
  const [doneToday] = useMinisCompleted();

  const pack = useMemo(() => getMiniPack(packId), [packId]);
  const [stage, setStage] = useState<Stage>('intro');
  const countedRef = useRef(false);

  /* 防锁屏 + 锁屏音频保活（仅计时运行态；artist 传小练包名） */
  useWakeLock((settings.keepScreenOn ?? true) && stage === 'run' && pack !== null);
  useBgAudioKeepAlive((settings.bgAudioKeepAlive ?? true) && stage === 'run' && pack !== null, pack?.name ?? '日常小练');

  /* 进入完成态：打卡（一次）+ 仪式（震动 + 语音） */
  useEffect(() => {
    if (stage !== 'done' || !pack || countedRef.current) return;
    countedRef.current = true;
    completeMini(pack.id);
    vibrate([60, 40, 60]);
    speak('漂亮，这套拿下了，已计入连续打卡');
  }, [stage, pack]);

  if (!pack) {
    return (
      <div className="safe-top">
        <EmptyState text="没有找到这个小练包，回首页挑一个吧。" actionLabel="回首页" onAction={() => navigate('/')} />
      </div>
    );
  }

  /* 凯格尔性别兜底：男不进女版、女不进男版（未填 profile 不拦） */
  if (pack.audience !== 'all' && profile?.gender && pack.audience !== profile.gender) {
    return <Navigate to="/" replace />;
  }

  const displayName = miniDisplayName(pack, profile);
  const alreadyDoneToday = doneToday.includes(pack.id);

  /* safe-top：intro 顶部的 ScreenHeader 叠加状态栏安全区（run/done 为 fixed 全屏，不受此 padding 影响） */
  return (
    <div className="safe-top">
      {stage === 'intro' ? (
        <>
          <ScreenHeader label="日常小练 · MINI" title={displayName} />
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.3, ease: 'easeOut' }}
          >
            <p className="text-2" style={{ margin: '4px 0 0', fontSize: 16, lineHeight: 1.6 }}>
              {pack.tagline}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Tag>约 {pack.minutes} 分钟</Tag>
              <Tag>计时引导 · 不用盯屏</Tag>
              {alreadyDoneToday ? <WarnTag>今天已练过</WarnTag> : null}
            </div>
          </motion.div>

          {/* 教学卡（凯格尔"先找到对的肌肉"等） */}
          {pack.teach && pack.teach.length > 0 ? (
            <section style={{ marginTop: 24 }}>
              <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
                练前必看
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {pack.teach.map((t, i) => (
                  <motion.div
                    key={t.title}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0.1 : 0.25, delay: 0.05 * i, ease: 'easeOut' }}
                    style={{
                      background: 'var(--bg-raised)',
                      border: '1px solid var(--line)',
                      borderLeft: '2px solid var(--accent)',
                      borderRadius: 4,
                      padding: '12px 14px',
                    }}
                  >
                    <div className="text-1" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                      {t.title}
                    </div>
                    <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.65 }}>
                      {t.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 内容清单 */}
          <section style={{ marginTop: 24 }}>
            <div className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
              这套练什么
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {outlineLines(pack).map((line, i) => (
                <p key={i} className="text-2" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  · {line}
                </p>
              ))}
            </div>
            {/* 凯格尔等级阶梯（数据预留，当前默认 Lv.1） */}
            {pack.levels && pack.levels.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {pack.levels.map((lv, i) => (
                  <Tag key={lv.id}>{i === 0 ? `当前 ${lv.name}` : lv.name}</Tag>
                ))}
              </div>
            ) : null}
          </section>

          {/* 注意事项 */}
          {pack.note ? (
            <p className="text-2" style={{ margin: '20px 0 0', fontSize: 13, lineHeight: 1.6, borderLeft: '2px solid var(--warn)', paddingLeft: 12 }}>
              {pack.note}
            </p>
          ) : null}

          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.1 } : { delay: 0.2, type: 'spring', stiffness: 400, damping: 18 }}
            style={{ marginTop: 24 }}
          >
            <PrimaryButton
              size="lg"
              icon={<Icon name="play" size={20} />}
              onClick={() => {
                vibrate(30);
                setStage('run');
              }}
            >
              开始（{pack.minutes} 分钟）
            </PrimaryButton>
          </motion.div>
          <div style={{ marginTop: 12 }}>
            <GhostButton size="sm" onClick={() => navigate('/')}>
              先不练，回首页
            </GhostButton>
          </div>
        </>
      ) : null}

      {/* 运行态：全屏计时器（AnimatePresence 负责下滑收起） */}
      <AnimatePresence>
        {stage === 'run' ? (
          <MiniTimer
            key="mini-timer"
            pack={pack}
            onFinish={() => setStage('done')}
            onExit={() => navigate('/')}
          />
        ) : null}
      </AnimatePresence>

      {/* 完成态：打勾仪式 + 已计入连续打卡 */}
      {stage === 'done' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.1 : 0.2 }}
          style={{
            position: 'fixed',
            inset: 0,
            height: 'calc(var(--vh, 1vh) * 100)',
            zIndex: 70,
            background: 'var(--bg-inset)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div aria-hidden className="crt" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 20px',
              maxWidth: 480,
              width: '100%',
              margin: '0 auto',
            }}
          >
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div
                aria-hidden
                initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0.9 }}
                animate={reduce ? { opacity: 0 } : { scale: 1.15, opacity: 0 }}
                transition={{ duration: reduce ? 0.1 : 0.6, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: 'var(--accent-dim)' }}
              />
              <CheckDraw size={88} />
            </div>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0.1 : 0.3, delay: 0.4 }}
              className="font-display text-1"
              style={{ margin: '18px 0 0', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center' }}
            >
              这套，拿下
            </motion.h1>
            <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, textAlign: 'center' }}>
              {displayName} 完成
            </p>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.3, delay: 0.55 }}
              style={{ margin: '14px 0 0', fontSize: 15, color: 'var(--accent-ink)', textAlign: 'center' }}
            >
              已计入连续打卡 · 当前 {cycle.streak} 天
            </motion.p>
            <div style={{ width: '100%', marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PrimaryButton size="lg" icon={<Icon name="check" size={20} />} onClick={() => navigate('/')}>
                回首页
              </PrimaryButton>
              <GhostButton
                onClick={() => {
                  countedRef.current = false;
                  setStage('intro');
                }}
              >
                再练一遍
              </GhostButton>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
