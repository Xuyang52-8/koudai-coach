/**
 * 我的 / 设置页（/settings）
 * 实现规格：/mnt/agents/output/design/settings.md
 * - §1 身体数据卡：身高 181 / 体重（可编辑，默认 81.5）/ 目标约 2250 大卡 / 蛋白约 150g；左右臂说明（只读）
 * - §2 AI 配置卡：DeepSeek Key（测试连通 testDeepSeekKey + 保存）+ 视觉端点三件套（OpenAI 兼容）
 * - §3 语音卡：ttsOn 总开关 + ttsCountdownOn 子开关 + 试听
 * - §4 数据卡：导出 JSON（koudai-coach:* 全部）/ 清空数据（输入"清空"二字确认）
 * - §5 关于卡：v1.0 + 免责声明
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '@/components/BottomSheet';
import { DangerButton, GhostButton, PrimaryButton } from '@/components/Buttons';
import { useFeedback, vibrate } from '@/components/feedback';
import Icon from '@/components/Icon';
import ScreenHeader from '@/components/ScreenHeader';
import SectionLabel from '@/components/SectionLabel';
import Tag, { WarnTag } from '@/components/Tag';
import TTSToggle from '@/components/TTSToggle';
import { Field, RowToggle, Stepper } from '@/components/library/inputs';
import {
  DietHabitChips,
  ExperienceCards,
  FatAreaChips,
  GenderCards,
  GoalCards,
  InjuryChips,
  LeftRightCards,
  PickerLabel,
  ScheduleModeCards,
  VenueCards,
  WeekdayChips,
} from '@/components/onboarding/selectors';
import { testDeepSeekKey } from '@/lib/ai';
import { RPE_LABELS, overrideDeltaText } from '@/lib/adjust';
import { getAllExerciseOverrides, resetExerciseOverride, updateSettings, useProfile, useSchedule, useSettings, useTargets } from '@/lib/store';
import { speak } from '@/lib/tts';
import type { UserProfile } from '@/lib/types';
import { getExerciseById } from '@/lib/utils-workout';

/** localStorage 键空间前缀（与 src/lib/store.ts 一致） */
const LS_PREFIX = 'koudai-coach:';

/* ================= 小组件 ================= */

/** 面板行（行间 1px 分隔线） */
function Panel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: '4px 18px',
      }}
    >
      {children}
    </div>
  );
}

function PanelRow({ children, last = false }: { children: ReactNode; last?: boolean }): JSX.Element {
  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: last ? 'none' : '1px solid var(--line)',
      }}
    >
      {children}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

/** 眼睛切换（共享 Icon 库无 eye，内联 SVG 补齐） */
function EyeIcon({ off = false, size = 20 }: { off?: boolean; size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** 700ms 旋转 spinner */
function Spinner(): JSX.Element {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
      style={{ display: 'inline-flex' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    </motion.span>
  );
}

/* ================= 主页面 ================= */

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const { toast, host } = useFeedback();

  /* ---- §1 身体数据 / 完整档案 ---- */
  const [profile, setProfile] = useProfile();
  const [schedule, setSchedule] = useSchedule();
  const targets = useTargets();
  const [weightSheetOpen, setWeightSheetOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState(settings.weightKg);
  // 无档案的老用户沿用旧口径：体重偏离 81.5kg 时目标热量 ±微调（约 25 大卡/kg，估算口径）
  const legacyTargetKcal = Math.round((2250 + (settings.weightKg - 81.5) * 25) / 10) * 10;

  /** 档案即改即存；体重同步进旧字段（summary 消耗估算仍读 settings.weightKg） */
  const patchProfile = (p: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...p } : prev));
    if (p.weightKg !== undefined) updateSettings({ weightKg: p.weightKg });
  };

  /* ---- §2 DeepSeek ---- */
  const [dsDraft, setDsDraft] = useState(settings.deepseekKey);
  const [dsShow, setDsShow] = useState(false);
  const [dsTest, setDsTest] = useState<TestState>('idle');
  const [dsError, setDsError] = useState('');
  const [dsFlash, setDsFlash] = useState(false);

  /* ---- §2 视觉端点 ---- */
  const [vEndpoint, setVEndpoint] = useState(settings.visionEndpoint);
  const [vKey, setVKey] = useState(settings.visionKey);
  const [vModel, setVModel] = useState(settings.visionModel);
  const [vShow, setVShow] = useState(false);
  const [vFlash, setVFlash] = useState(false);

  /* ---- §3 语音 ---- */
  const [auditioning, setAuditioning] = useState(false);

  /* ---- §4 数据 ---- */
  const [exported, setExported] = useState(false);
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [clearText, setClearText] = useState('');

  /* ---- 自适应训练（RPE 覆盖记录，重置后本地刷新） ---- */
  const [overrides, setOverrides] = useState(() => getAllExerciseOverrides());

  const resetOverride = (exerciseId: string, name: string) => {
    resetExerciseOverride(exerciseId);
    setOverrides(getAllExerciseOverrides());
    vibrate(15);
    toast(`已重置，${name}回到基准量`);
  };

  const flashInput = (set: (v: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 600);
  };

  /* ---- DeepSeek：保存 / 测试 ---- */
  const saveDeepSeekKey = () => {
    updateSettings({ deepseekKey: dsDraft.trim() });
    flashInput(setDsFlash);
    vibrate(15);
    toast(dsDraft.trim() ? 'Key 已存在本地' : 'Key 已清除');
  };

  const runDeepSeekTest = async () => {
    const key = dsDraft.trim() || settings.deepseekKey;
    if (!key) {
      setDsTest('fail');
      setDsError('先填 Key 再测');
      return;
    }
    setDsTest('testing');
    setDsError('');
    const res = await testDeepSeekKey(key);
    if (res.ok) {
      setDsTest('ok');
      setTimeout(() => setDsTest('idle'), 2000);
    } else {
      setDsTest('fail');
      setDsError(res.error ?? '没通，检查 Key 和网络');
    }
  };

  /* ---- 视觉端点：保存 ---- */
  const saveVision = () => {
    updateSettings({
      visionEndpoint: vEndpoint.trim(),
      visionKey: vKey.trim(),
      visionModel: vModel.trim(),
    });
    flashInput(setVFlash);
    vibrate(15);
    toast('视觉端点已保存');
  };

  /* ---- 试听 ---- */
  const audition = () => {
    setAuditioning(true);
    // 试听是功能验证，强制朗读（不受总开关影响）
    speak('你好，我是你的口袋私教', { force: true, onEnd: () => setAuditioning(false) });
    setTimeout(() => setAuditioning(false), 4000); // 兜底还原按钮态
  };

  /* ---- 导出 ---- */
  const exportData = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      try {
        data[k] = JSON.parse(localStorage.getItem(k) ?? 'null');
      } catch {
        data[k] = localStorage.getItem(k);
      }
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `koudai-sijiao-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  /* ---- 清空 ---- */
  const clearAll = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    vibrate([50, 50, 50]);
    // 整页重载：清空 store 内存缓存，回到首屏初始态
    window.location.href = '/';
  };

  const maskedSaved = settings.deepseekKey
    ? `${settings.deepseekKey.slice(0, 3)}····${settings.deepseekKey.slice(-4)}`
    : '';

  return (
    <div>
      {host}
      <ScreenHeader label="我的 · SETTINGS" title="设置与数据" actions={<TTSToggle />} />

      {/* ============ §1 身体数据卡 / 完整档案 ============ */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <SectionLabel index="身体">我的数据</SectionLabel>
        {profile ? (
          /* ---------- 完整档案（与首次问卷同组件，改完即存） ---------- */
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel>
              <PanelRow>
                <PickerLabel>性别</PickerLabel>
                <GenderCards value={profile.gender} onChange={(gender) => patchProfile({ gender })} />
              </PanelRow>
              <PanelRow>
                <Stepper label="年龄" value={profile.age} onChange={(age) => patchProfile({ age })} min={12} max={80} unit="岁" />
              </PanelRow>
              <PanelRow>
                <Stepper label="身高" value={profile.heightCm} onChange={(heightCm) => patchProfile({ heightCm })} min={130} max={220} unit="cm" />
              </PanelRow>
              <PanelRow last>
                <Stepper
                  label="体重"
                  value={profile.weightKg}
                  onChange={(weightKg) => patchProfile({ weightKg })}
                  min={35}
                  max={200}
                  step={0.5}
                  decimals={1}
                  unit="kg"
                />
                <Caption>约 {Math.round(profile.weightKg * 2)} 斤 · 一周称一次就够，早上空腹</Caption>
              </PanelRow>
            </Panel>

            <Panel>
              <PanelRow>
                <PickerLabel>训练经验</PickerLabel>
                <ExperienceCards value={profile.experience} onChange={(experience) => patchProfile({ experience })} />
              </PanelRow>
              <PanelRow>
                <PickerLabel>旧伤（多选）</PickerLabel>
                <InjuryChips value={profile.injuries} onChange={(injuries) => patchProfile({ injuries })} />
              </PanelRow>
              <PanelRow>
                <PickerLabel>左右力量差</PickerLabel>
                <LeftRightCards value={profile.leftRightDiff} onChange={(leftRightDiff) => patchProfile({ leftRightDiff })} />
              </PanelRow>
              <PanelRow>
                <PickerLabel>脂肪主要堆在哪（多选）</PickerLabel>
                <FatAreaChips value={profile.fatAreas} onChange={(fatAreas) => patchProfile({ fatAreas })} />
              </PanelRow>
              <PanelRow>
                <PickerLabel>目标</PickerLabel>
                <GoalCards value={profile.goal} onChange={(goal) => patchProfile({ goal })} />
              </PanelRow>
              <PanelRow>
                <PickerLabel>饮食习惯（多选）</PickerLabel>
                <DietHabitChips value={profile.dietHabits} onChange={(dietHabits) => patchProfile({ dietHabits })} />
              </PanelRow>
              <PanelRow last>
                <PickerLabel>你能在哪练（至少一个）</PickerLabel>
                <VenueCards
                  value={profile.venues}
                  onChange={(venues) => {
                    if (venues.length > 0) patchProfile({ venues });
                  }}
                />
                <Caption>计划按你的场地自动换动作，器材多的场地优先排课。</Caption>
              </PanelRow>
            </Panel>

            <Panel>
              <PanelRow>
                <PickerLabel>排期</PickerLabel>
                <ScheduleModeCards value={schedule.mode} onChange={(mode) => setSchedule((s) => ({ ...s, mode }))} />
              </PanelRow>
              {schedule.mode === 'weekdays' ? (
                <PanelRow>
                  <PickerLabel>哪几天练</PickerLabel>
                  <WeekdayChips
                    value={schedule.weekdays}
                    onChange={(weekdays) => {
                      if (weekdays.length > 0) setSchedule((s) => ({ ...s, weekdays }));
                    }}
                  />
                </PanelRow>
              ) : null}
              <PanelRow last>
                <PickerLabel>你的营养目标（自动重算）</PickerLabel>
                <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    热量 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 {targets.targetKcal}</span> 大卡/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    蛋白 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 {targets.proteinG}</span> g/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    脂肪 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 {targets.fatG}</span> g
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    碳水 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 {targets.carbsG}</span> g
                  </span>
                </div>
                <Caption>按 Mifflin 公式算（基础代谢约 {targets.bmr} · 日常消耗约 {targets.tdee}），改上面任意一项即时更新。</Caption>
              </PanelRow>
            </Panel>
          </div>
        ) : (
          /* ---------- 无档案老用户：保持旧卡 + 引导补填问卷 ---------- */
          <div style={{ marginTop: 14 }}>
            <Panel>
              <PanelRow>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="text-2" style={{ fontSize: 13 }}>身高</span>
                    <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>181</span>
                    <span className="text-3" style={{ fontSize: 12 }}>cm</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="text-2" style={{ fontSize: 13 }}>体重</span>
                    <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>{settings.weightKg.toFixed(1)}</span>
                    <span className="text-3" style={{ fontSize: 12 }}>kg（{Math.round(settings.weightKg * 2)}斤）</span>
                  </div>
                  <GhostButton
                    size="sm"
                    fullWidth={false}
                    style={{ minHeight: 48, padding: '0 16px' }}
                    onClick={() => {
                      setWeightDraft(settings.weightKg);
                      setWeightSheetOpen(true);
                    }}
                  >
                    更新
                  </GhostButton>
                </div>
              </PanelRow>
              <PanelRow>
                <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    目标 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 {legacyTargetKcal}</span> 大卡/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    蛋白 <span className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>约 150</span> g/天
                  </span>
                </div>
              </PanelRow>
              <PanelRow>
                <p
                  className="text-2"
                  style={{ margin: 0, fontSize: 13, lineHeight: 1.6, borderLeft: '2px solid var(--warn)', paddingLeft: 10 }}
                >
                  左右差：右臂壮（右手吊杠 4-5 秒，左手吊不住）→ 所有单侧动作左侧先做
                </p>
              </PanelRow>
              <PanelRow>
                <Caption>目标：1 个月养成习惯 · 减脂 + 增肌 + 塑形</Caption>
              </PanelRow>
              <PanelRow last>
                <GhostButton icon={<Icon name="arrow-right" size={18} />} onClick={() => navigate('/onboarding')}>
                  做个 2 分钟问卷，计划更合身
                </GhostButton>
                <Caption>填完按你的身体算热量和蛋白目标，课程也按你的场地自动换动作。</Caption>
              </PanelRow>
            </Panel>
          </div>
        )}
      </motion.section>

      {/* ============ §2 AI 配置卡 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="AI">让估算更准</SectionLabel>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* DeepSeek */}
          <Panel>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>DeepSeek API Key</span>
                {settings.deepseekKey ? <Tag>已配置</Tag> : <WarnTag>未配置</WarnTag>}
              </div>
              <Caption>用于口述记饮食的智能估算，Key 只存在你手机本地</Caption>
            </PanelRow>
            <PanelRow>
              <Field
                type={dsShow ? 'text' : 'password'}
                value={dsDraft}
                onChange={setDsDraft}
                placeholder="sk-..."
                flash={dsFlash}
                right={
                  <button
                    type="button"
                    aria-label={dsShow ? '隐藏 Key' : '显示 Key'}
                    onClick={() => setDsShow((s) => !s)}
                    style={{
                      width: 44,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <EyeIcon off={dsShow} />
                  </button>
                }
              />
              {maskedSaved ? <Caption>已保存：{maskedSaved}</Caption> : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <GhostButton
                  size="sm"
                  onClick={runDeepSeekTest}
                  disabled={dsTest === 'testing'}
                  icon={dsTest === 'testing' ? <Spinner /> : undefined}
                  style={
                    dsTest === 'ok'
                      ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                      : dsTest === 'fail'
                        ? { borderColor: 'var(--danger)', color: 'var(--danger)' }
                        : undefined
                  }
                >
                  {dsTest === 'testing' ? '测试中' : dsTest === 'ok' ? '通了 ✓' : '测试连通'}
                </GhostButton>
                <PrimaryButton size="sm" onClick={saveDeepSeekKey}>
                  保存
                </PrimaryButton>
              </div>
              {dsTest === 'fail' && dsError ? (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>没通：{dsError}</p>
              ) : null}
            </PanelRow>
            <PanelRow last>
              <Caption>
                Key 只存在你手机本地（localStorage），浏览器直连 api.deepseek.com，不经过任何中间服务器。
              </Caption>
              <a
                href="https://platform.deepseek.com/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-2"
                style={{ display: 'inline-block', marginTop: 6, fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}
              >
                没有 Key？去 platform.deepseek.com 注册 ↗
              </a>
            </PanelRow>
          </Panel>

          {/* 视觉端点 */}
          <Panel>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>拍照识热量（视觉端点）</span>
                {settings.visionEndpoint && settings.visionKey && settings.visionModel ? <Tag>已配置</Tag> : <WarnTag>未配置</WarnTag>}
              </div>
              <Caption>用于拍照识热量，支持任何 OpenAI 兼容视觉 API（智谱 GLM-4V / 通义 Qwen-VL 等）</Caption>
            </PanelRow>
            <PanelRow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field
                  label="接口地址 Base URL"
                  value={vEndpoint}
                  onChange={setVEndpoint}
                  placeholder="https://open.bigmodel.cn/api/paas/v4"
                  inputMode="url"
                  flash={vFlash}
                />
                <Field
                  label="API Key"
                  type={vShow ? 'text' : 'password'}
                  value={vKey}
                  onChange={setVKey}
                  placeholder="视觉服务的 Key"
                  flash={vFlash}
                  right={
                    <button
                      type="button"
                      aria-label={vShow ? '隐藏 Key' : '显示 Key'}
                      onClick={() => setVShow((s) => !s)}
                      style={{
                        width: 44,
                        height: 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <EyeIcon off={vShow} />
                    </button>
                  }
                />
                <Field label="模型名" value={vModel} onChange={setVModel} placeholder="glm-4v-flash / qwen-vl-max …" flash={vFlash} />
                <PrimaryButton size="sm" onClick={saveVision}>
                  保存视觉配置
                </PrimaryButton>
              </div>
            </PanelRow>
            <PanelRow last>
              <Caption>随便哪家 OpenAI 兼容的多模态服务都行，填了就能在饮食页拍照估算。</Caption>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ============ §3 语音卡 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="语音">朗读开关</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>全局语音</div>
                  <Caption>读动作要领、训练提示（浏览器自带语音，离线可用）</Caption>
                </div>
                <RowToggle on={settings.ttsOn} onChange={(on) => updateSettings({ ttsOn: on })} label="全局语音" />
              </div>
            </PanelRow>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>组间倒计时语音倒数</div>
                  <Caption>最后 10 秒报数，健身房吵建议开</Caption>
                </div>
                <RowToggle
                  on={settings.ttsCountdownOn}
                  onChange={(on) => updateSettings({ ttsCountdownOn: on })}
                  label="组间倒计时语音倒数"
                />
              </div>
            </PanelRow>
            <PanelRow last>
              <GhostButton
                size="sm"
                icon={<Icon name="tts-on" size={18} />}
                onClick={audition}
                style={auditioning ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              >
                {auditioning ? '正在试听…' : '试听一句'}
              </GhostButton>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ============ §3.5 自适应训练卡 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="自适应">自适应训练</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            {overrides.length === 0 ? (
              <PanelRow>
                <p className="text-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                  还没有调整记录。去练一节课，每个动作做完告诉我感觉，这里就会长出来。
                </p>
              </PanelRow>
            ) : (
              overrides.map(({ exerciseId, override }) => {
                const ex = getExerciseById(exerciseId);
                const name = ex?.name ?? '已删除的动作';
                return (
                  <PanelRow key={exerciseId}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-1" style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.4 }}>
                          {name}
                        </div>
                        <div className="text-2" style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5 }}>
                          {overrideDeltaText(ex, override)} · 上次觉得：{RPE_LABELS[override.lastRpe]}
                        </div>
                      </div>
                      <GhostButton
                        size="sm"
                        fullWidth={false}
                        style={{ minHeight: 44, padding: '0 14px', flexShrink: 0 }}
                        onClick={() => resetOverride(exerciseId, name)}
                      >
                        重置
                      </GhostButton>
                    </div>
                  </PanelRow>
                );
              })
            )}
            <PanelRow last>
              <Caption>练完每个动作告诉我感觉，计划会自己长。</Caption>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ============ §4 数据卡 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="数据">导出与清空</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow>
              <GhostButton
                icon={exported ? <Icon name="check" size={18} /> : <Icon name="export" size={18} />}
                onClick={exportData}
                style={exported ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              >
                {exported ? '已导出 ✓' : '导出我的数据'}
              </GhostButton>
              <Caption>训练记录 / 饮食 / 体重 / 补剂打卡，打包成 JSON。存到文件里，换手机能导回（手动复制 JSON）。</Caption>
            </PanelRow>
            <PanelRow last>
              <DangerButton icon={<Icon name="trash" size={18} />} onClick={() => setClearSheetOpen(true)}>
                清空所有数据
              </DangerButton>
              <Caption>只清本 App 的数据（koudai-coach:*），不影响其他站点。</Caption>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ============ §5 关于卡 ============ */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.24 }}
        style={{ marginTop: 32, textAlign: 'center' }}
      >
        <p className="text-3" style={{ margin: 0, fontSize: 13, lineHeight: 1.8 }}>
          口袋私教 v1.0 · 数据全在你手机本地
        </p>
        <p className="text-3" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.8 }}>
          重量从最小开始，疼就停，必要时请线下教练指导
        </p>
        <p className="text-3" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.8 }}>
          PWA：浏览器菜单选「添加到主屏幕」，下次桌面直接点开，离线也能用
        </p>
        <p className="text-3" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.8 }}>
          动作教程外链自 B 站/抖音搜索，感谢各位 up 主
        </p>
      </motion.section>

      {/* ============ 体重更新 BottomSheet ============ */}
      <BottomSheet open={weightSheetOpen} onClose={() => setWeightSheetOpen(false)} title="更新体重">
        <Stepper
          label="当前体重"
          value={weightDraft}
          onChange={setWeightDraft}
          min={40}
          max={200}
          step={0.1}
          decimals={1}
          unit="kg"
        />
        <Caption>一周称一次就够，早上空腹。目标热量会随体重自动微调（估算口径）。</Caption>
        <div style={{ marginTop: 20 }}>
          <PrimaryButton
            onClick={() => {
              updateSettings({ weightKg: weightDraft });
              setWeightSheetOpen(false);
              toast('体重已更新');
            }}
          >
            保存
          </PrimaryButton>
        </div>
      </BottomSheet>

      {/* ============ 清空确认 BottomSheet ============ */}
      <BottomSheet open={clearSheetOpen} onClose={() => setClearSheetOpen(false)} title="清空确认">
        <h3 className="text-1" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          全清？
        </h3>
        <p className="text-2" style={{ margin: '10px 0 16px', fontSize: 15, lineHeight: 1.6 }}>
          训练记录、饮食记录、API Key、自建动作全部删除，不可恢复。在下方输入「清空」两个字确认。
        </p>
        <Field value={clearText} onChange={setClearText} placeholder='输入"清空"确认' />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <DangerButton
            disabled={clearText !== '清空'}
            icon={<Icon name="trash" size={18} />}
            onClick={clearAll}
            style={{ transition: 'opacity 200ms, background 200ms' }}
          >
            我确定，全部删掉
          </DangerButton>
          <GhostButton
            onClick={() => {
              setClearSheetOpen(false);
              setClearText('');
            }}
          >
            再想想
          </GhostButton>
        </div>
      </BottomSheet>
    </div>
  );
}
