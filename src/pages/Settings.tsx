/**
 * 我的 / 设置页（/settings）—— 三组信息架构
 * - 01 常用：外观（白天/黑夜）· 语音朗读开关 · 训练体验三开关 · 我的器械入口 · 训练提醒
 * - 02 训练：身体数据（完整档案）· 排期模式 · 能力等级 · 自适应训练
 * - 03 高级（默认折叠，点开展开）：DeepSeek/视觉 API 配置 · 数据备份（导出/导入恢复）· 重置/清空
 * 备份导出/导入/校验逻辑集中在 @/lib/backup；AI 配置与数据面板组件在 @/components/settings/。
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '@/components/BottomSheet';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { useFeedback, vibrate } from '@/components/feedback';
import Icon from '@/components/Icon';
import ScreenHeader from '@/components/ScreenHeader';
import SectionLabel from '@/components/SectionLabel';
import Tag from '@/components/Tag';
import TTSToggle from '@/components/TTSToggle';
import { RowToggle, Stepper } from '@/components/library/inputs';
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
import { AiConfigPanels } from '@/components/settings/AiConfigPanels';
import { EquipmentRow, LibraryRow, NotifyRow } from '@/components/settings/CommonRows';
import { BackupPanel, DangerPanel } from '@/components/settings/DataPanels';
import { Caption, GroupHeader, Panel, PanelRow } from '@/components/settings/common';
import { RPE_LABELS, overrideDeltaText } from '@/lib/adjust';
import { getCapability } from '@/lib/capability';
import {
  getAllExerciseOverrides,
  resetExerciseOverride,
  updateSettings,
  useCycle,
  useProfile,
  useSchedule,
  useSettings,
  useTargets,
} from '@/lib/store';
import { speak, ttsSupported } from '@/lib/tts';
import type { UserProfile } from '@/lib/types';
import { getExerciseById } from '@/lib/utils-workout';

export default function Settings(): JSX.Element {
  const navigate = useNavigate();
  const [settings] = useSettings();
  const { toast, host } = useFeedback();

  /* ---- 能力等级（按已完成课数自动升级，容量跟着长） ---- */
  const [cycle] = useCycle();
  const capability = getCapability(cycle);

  /* ---- 身体数据 / 完整档案 ---- */
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

  /* ---- 语音试听 ---- */
  const [auditioning, setAuditioning] = useState(false);

  /* ---- 自适应训练（RPE 覆盖记录，重置后本地刷新） ---- */
  const [overrides, setOverrides] = useState(() => getAllExerciseOverrides());

  /* ---- 高级组：默认折叠 ---- */
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const resetOverride = (exerciseId: string, name: string) => {
    resetExerciseOverride(exerciseId);
    setOverrides(getAllExerciseOverrides());
    vibrate(15);
    toast(`已重置，${name}回到基准量`);
  };

  const audition = () => {
    setAuditioning(true);
    // 试听是功能验证，强制朗读（不受总开关影响）
    speak('你好，我是你的口袋私教', { force: true, onEnd: () => setAuditioning(false) });
    setTimeout(() => setAuditioning(false), 4000); // 兜底还原按钮态
  };

  return (
    <div>
      {host}
      <ScreenHeader label="我的 · SETTINGS" title="设置与数据" actions={<TTSToggle />} />

      {/* ============================================================
          组一 · 常用
         ============================================================ */}
      <GroupHeader index="01" title="常用" first />

      {/* ---- 外观：白天 / 黑夜 ---- */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <SectionLabel index="外观">白天 / 黑夜</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow last>
              <div role="radiogroup" aria-label="外观主题" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { value: 'light', label: '白天模式', hint: '白灰极简' },
                  { value: 'dark', label: '黑夜模式', hint: '默认深色' },
                ] as const).map((opt) => {
                  const active = (settings.theme ?? 'dark') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        updateSettings({ theme: opt.value });
                        vibrate(15);
                      }}
                      style={{
                        minHeight: 52,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        borderRadius: 4,
                        border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                        background: active ? 'var(--accent-dim)' : 'transparent',
                        color: active ? 'var(--accent-ink)' : 'var(--text-1)',
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                        transition: 'border-color 150ms, background 150ms, color 150ms',
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{opt.label}</span>
                      <span style={{ fontSize: 12, color: active ? 'var(--accent-ink)' : 'var(--text-3)' }}>{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
              <Caption>白天模式是白灰极简风，薄荷绿强调色不变；切换立即生效，下次打开记住。</Caption>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ---- 语音朗读开关 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
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
                style={auditioning ? { borderColor: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
              >
                {auditioning ? '正在试听…' : '试听一句'}
              </GhostButton>
              {!ttsSupported() && (
                <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--warn)' }}>
                  当前浏览器不支持语音朗读（微信/内置浏览器常见）——请点右上角「在浏览器打开」，用系统浏览器访问就有声音了。
                </p>
              )}
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ---- 训练体验三开关 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="体验">训练体验</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>自动朗读要领</div>
                  <Caption>翻到下一个动作自动读要领，不用手点（需全局语音同开）</Caption>
                </div>
                <RowToggle
                  on={settings.ttsAuto ?? true}
                  onChange={(on) => updateSettings({ ttsAuto: on })}
                  label="自动朗读要领"
                />
              </div>
            </PanelRow>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>训练时屏幕常亮</div>
                  <Caption>训练中不自动锁屏，离开训练页自动恢复</Caption>
                </div>
                <RowToggle
                  on={settings.keepScreenOn ?? true}
                  onChange={(on) => updateSettings({ keepScreenOn: on })}
                  label="训练时屏幕常亮"
                />
              </div>
            </PanelRow>
            <PanelRow last>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>锁屏后保持语音</div>
                  <Caption>锁屏后计时和朗读尽量继续。安卓更有效，iOS 受系统限制</Caption>
                </div>
                <RowToggle
                  on={settings.bgAudioKeepAlive ?? true}
                  onChange={(on) => updateSettings({ bgAudioKeepAlive: on })}
                  label="锁屏后保持语音"
                />
              </div>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ---- 我的器械入口 + 训练提醒 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="器械">器械与提醒</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow>
              <EquipmentRow />
            </PanelRow>
            <PanelRow>
              <LibraryRow />
            </PanelRow>
            <PanelRow last>
              <NotifyRow />
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ============================================================
          组二 · 训练
         ============================================================ */}
      <GroupHeader index="02" title="训练" />

      {/* ---- 身体数据 / 完整档案 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}
      >
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
              <PanelRow last>
                <PickerLabel>你的营养目标（自动重算）</PickerLabel>
                <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    热量 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 {targets.targetKcal}</span> 大卡/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    蛋白 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 {targets.proteinG}</span> g/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    脂肪 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 {targets.fatG}</span> g
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    碳水 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 {targets.carbsG}</span> g
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
                    目标 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 {legacyTargetKcal}</span> 大卡/天
                  </span>
                  <span className="text-2" style={{ fontSize: 13 }}>
                    蛋白 <span className="num" style={{ fontSize: 16, color: 'var(--accent-ink)' }}>约 150</span> g/天
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

      {/* ---- 排期模式（schedule 独立存储，不依赖档案） ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="排期">排期模式</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow last={schedule.mode !== 'weekdays'}>
              <PickerLabel>排期</PickerLabel>
              <ScheduleModeCards value={schedule.mode} onChange={(mode) => setSchedule((s) => ({ ...s, mode }))} />
            </PanelRow>
            {schedule.mode === 'weekdays' ? (
              <PanelRow last>
                <PickerLabel>哪几天练</PickerLabel>
                <WeekdayChips
                  value={schedule.weekdays}
                  onChange={(weekdays) => {
                    if (weekdays.length > 0) setSchedule((s) => ({ ...s, weekdays }));
                  }}
                />
              </PanelRow>
            ) : null}
          </Panel>
        </div>
      </motion.section>

      {/* ---- 能力等级 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
        style={{ marginTop: 28 }}
      >
        <SectionLabel index="能力">能力等级</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <Panel>
            <PanelRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>
                    Lv.{capability.level} {capability.label}
                  </div>
                  <Caption>
                    已练 <span className="num">{capability.lessonsDone}</span> 节课
                  </Caption>
                </div>
                <Tag>Lv.{capability.level}</Tag>
              </div>
            </PanelRow>
            <PanelRow>
              <p className="text-1" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                {capability.coachNote}
              </p>
            </PanelRow>
            <PanelRow last>
              <Caption>等级按你完成的课数自动升级，方案容量跟着长。</Caption>
            </PanelRow>
          </Panel>
        </div>
      </motion.section>

      {/* ---- 自适应训练 ---- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35, ease: 'easeOut' }}
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

      {/* ============================================================
          组三 · 高级（默认折叠，点开展开）
         ============================================================ */}
      <GroupHeader
        index="03"
        title="高级"
        collapsible
        open={advancedOpen}
        hint="API · 备份 · 清空"
        onToggle={() => {
          setAdvancedOpen((o) => !o);
          vibrate(15);
        }}
      />

      {advancedOpen ? (
        <>
          {/* ---- DeepSeek / 视觉 API 配置 ---- */}
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
            <SectionLabel index="AI">让估算更准</SectionLabel>
            <div style={{ marginTop: 14 }}>
              <AiConfigPanels toast={toast} />
            </div>
          </motion.section>

          {/* ---- 数据备份：导出 / 导入恢复 ---- */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.06, ease: 'easeOut' }}
            style={{ marginTop: 28 }}
          >
            <SectionLabel index="数据">数据备份</SectionLabel>
            <div style={{ marginTop: 14 }}>
              <BackupPanel toast={toast} />
            </div>
          </motion.section>

          {/* ---- 重置 / 清空 ---- */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12, ease: 'easeOut' }}
            style={{ marginTop: 28 }}
          >
            <SectionLabel index="危险">重置 / 清空</SectionLabel>
            <div style={{ marginTop: 14 }}>
              <DangerPanel />
            </div>
          </motion.section>
        </>
      ) : null}

      {/* ---- 关于 ---- */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
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

      {/* ---- 体重更新 BottomSheet ---- */}
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
    </div>
  );
}
