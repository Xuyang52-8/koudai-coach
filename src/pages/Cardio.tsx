/**
 * 跑步打卡（/cardio）v1.5
 * 三条数据通路：Health Connect 自动同步（小米运动健康/Keep）＞ 截图 AI 识别 ＞ 手动补录。
 * 入账统一进 koudai-coach:cardio:{date}，首页「今日总消耗」自动合并。
 * 顶部附「昨晚睡眠」卡（Health Connect 有数据时显示）。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '../components/BottomSheet';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import {
  estimateRunKcal,
  estimateRunPhoto,
  healthConnectAvailable,
  isNativeShell,
  readHealthExercise,
  readLastSleepHours,
  requestHealthPermissions,
} from '../lib/health';
import type { HealthSession } from '../lib/health';
import {
  addCardioEntry,
  removeCardioEntry,
  useCardioEntries,
  useSettings,
} from '../lib/store';
import type { CardioEntry } from '../lib/store';

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve(url.includes(',') ? url.slice(url.indexOf(',') + 1) : url);
    };
    reader.onerror = () => reject(new Error('read file failed'));
    reader.readAsDataURL(file);
  });
}

/** 识别结果确认表单（认错能改） */
interface ConfirmForm {
  label: string;
  distanceKm: string;
  minutes: string;
  kcal: string;
  source: CardioEntry['source'];
}

export default function Cardio(): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { toast, celebrate, host } = useFeedback();
  const [settings] = useSettings();
  const [entries] = useCardioEntries();

  /* ---------- Health Connect ---------- */
  const [hcAvailable, setHcAvailable] = useState<boolean | null>(null);
  const [hcBusy, setHcBusy] = useState(false);
  const [hcSessions, setHcSessions] = useState<HealthSession[] | null>(null);
  const [sleepHours, setSleepHours] = useState<number | null>(null);

  useEffect(() => {
    if (!isNativeShell()) {
      setHcAvailable(false);
      return;
    }
    void healthConnectAvailable().then(setHcAvailable);
    void readLastSleepHours().then(setSleepHours);
  }, []);

  const syncHealthConnect = async (): Promise<void> => {
    if (hcBusy) return;
    setHcBusy(true);
    try {
      const granted = await requestHealthPermissions();
      if (!granted) {
        toast('没拿到健康数据权限——在弹出的页面里把运动、睡眠都勾上');
        return;
      }
      const sessions = await readHealthExercise(1);
      setHcSessions(sessions);
      if (sessions.length === 0) toast('今天还没读到运动记录，跑完步再来同步');
      const sleep = await readLastSleepHours();
      setSleepHours(sleep);
    } finally {
      setHcBusy(false);
    }
  };

  const importSession = (s: HealthSession): void => {
    vibrate(15);
    /* 去重：同开始时间的记录只入一次 */
    const dup = entries.some((e) => e.label === labelOf(s));
    if (dup) {
      toast('这条已经入过账了');
      return;
    }
    addCardioEntry({
      label: labelOf(s),
      minutes: s.minutes,
      kcal: s.kcal > 0 ? s.kcal : estimateRunKcal(settings.weightKg, s.distanceKm || null, s.minutes),
      distanceKm: s.distanceKm > 0 ? s.distanceKm : undefined,
      source: 'health-connect',
    });
    celebrate('同步进来了，已计入今日总消耗');
  };

  /* ---------- 截图识别 ---------- */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmForm | null>(null);

  const onPhotoPicked = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const r = await estimateRunPhoto(base64);
      if (!r.label && !r.kcal && !r.distanceKm && !r.minutes) {
        toast('没读出来，换张清楚点的结算页截图');
        return;
      }
      setConfirm({
        label: r.label ?? '跑步',
        distanceKm: r.distanceKm != null ? String(r.distanceKm) : '',
        minutes: r.minutes != null ? String(r.minutes) : '',
        kcal: r.kcal != null ? String(r.kcal) : '',
        source: 'ai',
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : '识别失败，手动补录吧');
    } finally {
      setPhotoBusy(false);
    }
  };

  /* ---------- 手动补录 ---------- */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ label: '跑步', distanceKm: '', minutes: '' });

  /* ---------- 确认入库 ---------- */
  const saveEntry = (label: string, minutes: number, kcal: number, distanceKm: number | undefined, source: CardioEntry['source']): void => {
    addCardioEntry({ label, minutes, kcal, distanceKm, source });
    celebrate(`记上了：${label}，${kcal} 大卡`);
  };

  const totalKcal = entries.reduce((s, e) => s + e.kcal, 0);

  return (
    <div>
      {host}
      <ScreenHeader label="有氧 · CARDIO" title="跑步打卡" actions={<GhostButton size="sm" onClick={() => navigate('/')}>回首页</GhostButton>} />

      {/* ===== 昨晚睡眠 ===== */}
      {sleepHours !== null ? (
        <motion.section
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{ marginTop: 20 }}
        >
          <div style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ color: 'var(--accent-ink)', display: 'inline-flex' }}>
              <Icon name="timer" size={24} />
            </span>
            <div>
              <div className="text-2" style={{ fontSize: 13 }}>
                昨晚睡眠
              </div>
              <div className="num text-1" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
                {sleepHours} <span style={{ fontSize: 13, fontWeight: 400 }}>小时</span>
              </div>
            </div>
            <span className="text-3" style={{ marginLeft: 'auto', fontSize: 13 }}>
              {sleepHours >= 7 ? '睡得不错，今天能练' : '没睡够，今天重量别硬顶'}
            </span>
          </div>
        </motion.section>
      ) : null}

      {/* ===== 通路 1：Health Connect 自动同步 ===== */}
      <section style={{ marginTop: 24 }}>
        <SectionLabel index="同步">小米运动健康 · 自动读</SectionLabel>
        <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 4, padding: '14px 16px' }}>
          {hcAvailable === false ? (
            <p className="text-2" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              {isNativeShell()
                ? '这台手机没装 Health Connect（谷歌健康数据平台）。装了并在小米运动健康里开启数据共享后，这里就能自动读数。'
                : '自动同步只在安卓 App 里可用，网页版请用截图识别或手动补录。'}
            </p>
          ) : (
            <>
              <p className="text-2" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                跑完点一下，自动读今天的运动记录（需在小米运动健康里打开「数据共享到 Health Connect」）。
              </p>
              <div style={{ marginTop: 12 }}>
                <PrimaryButton size="sm" onClick={() => void syncHealthConnect()} disabled={hcBusy}>
                  {hcBusy ? '读取中…' : '同步今天的运动记录'}
                </PrimaryButton>
              </div>
            </>
          )}
          {hcSessions && hcSessions.length > 0 ? (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {hcSessions.map((s) => (
                <div key={s.startMillis} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-1" style={{ fontSize: 15, fontWeight: 500 }}>
                      {labelOf(s)}
                    </div>
                    <div className="text-3" style={{ fontSize: 13 }}>
                      {s.minutes} 分钟{s.distanceKm > 0 ? ` · ${s.distanceKm} km` : ''}{s.kcal > 0 ? ` · ${s.kcal} 大卡` : ''}
                    </div>
                  </div>
                  <GhostButton size="sm" fullWidth={false} onClick={() => importSession(s)}>
                    入账
                  </GhostButton>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ===== 通路 2：截图 AI 识别 ===== */}
      <section style={{ marginTop: 24 }}>
        <SectionLabel index="截图">结算页拍照/截图识别</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <GhostButton
            icon={<Icon name="camera" size={20} />}
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
          >
            {photoBusy ? '识别中…' : '拍 Keep / 小米健康 / 跑步机屏幕'}
          </GhostButton>
          <p className="text-3" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            AI 读出距离/时长/热量后会先给你确认，认错了能改。
          </p>
        </div>
      </section>

      {/* ===== 通路 3：手动补录 ===== */}
      <section style={{ marginTop: 24 }}>
        <SectionLabel index="手动">没图就手填</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <GhostButton icon={<Icon name="plus" size={20} />} onClick={() => setManualOpen(true)}>
            手动补一笔
          </GhostButton>
        </div>
      </section>

      {/* ===== 今日有氧流水 ===== */}
      <section style={{ marginTop: 28 }}>
        <SectionLabel index="流水">今天的有氧 · 共 {totalKcal} 大卡</SectionLabel>
        {entries.length === 0 ? (
          <p className="text-3" style={{ margin: '14px 0 0', fontSize: 13 }}>
            还没有记录。同步、拍照或手填，随你。
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-1" style={{ fontSize: 15, fontWeight: 500 }}>
                    {e.label}
                  </div>
                  <div className="text-3" style={{ fontSize: 13 }}>
                    {e.minutes} 分钟{e.distanceKm ? ` · ${e.distanceKm} km` : ''} · {e.kcal} 大卡
                    {e.source === 'health-connect' ? ' · 自动同步' : e.source === 'ai' ? ' · 截图识别' : ' · 手动'}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="删除这条"
                  onClick={() => {
                    vibrate(15);
                    removeCardioEntry(e.id);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', padding: 8, WebkitTapHighlightColor: 'transparent' }}
                >
                  删
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onPhotoPicked(e)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ===== 识别结果确认 Sheet ===== */}
      <BottomSheet open={confirm !== null} onClose={() => setConfirm(null)} title="确认一下，认错了能改">
        {confirm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(
              [
                ['名称', 'label', '跑步'],
                ['距离（公里）', 'distanceKm', '3.0'],
                ['时长（分钟）', 'minutes', '25'],
                ['热量（大卡）', 'kcal', '210'],
              ] as const
            ).map(([label, key, ph]) => (
              <label key={key} style={{ display: 'block' }}>
                <span className="text-2" style={{ fontSize: 13 }}>
                  {label}
                </span>
                <input
                  value={confirm[key]}
                  placeholder={ph}
                  inputMode={key === 'label' ? 'text' : 'decimal'}
                  onChange={(ev) => setConfirm({ ...confirm, [key]: ev.target.value })}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    marginTop: 6,
                    padding: '0 12px',
                    borderRadius: 4,
                    border: '1px solid var(--line-strong)',
                    background: 'var(--bg-raised)',
                    color: 'var(--text-1)',
                    fontSize: 16,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            ))}
            <PrimaryButton
              onClick={() => {
                const minutes = Number(confirm.minutes) || 0;
                const distanceKm = Number(confirm.distanceKm) || undefined;
                const kcal = Number(confirm.kcal) || estimateRunKcal(settings.weightKg, distanceKm ?? null, minutes || null);
                saveEntry(confirm.label || '跑步', minutes, kcal, distanceKm, confirm.source);
                setConfirm(null);
              }}
            >
              没错，入账
            </PrimaryButton>
          </div>
        ) : null}
      </BottomSheet>

      {/* ===== 手动补录 Sheet ===== */}
      <BottomSheet open={manualOpen} onClose={() => setManualOpen(false)} title="手动补一笔">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(
            [
              ['名称', 'label', '跑步'],
              ['距离（公里，可空）', 'distanceKm', '3.0'],
              ['时长（分钟）', 'minutes', '25'],
            ] as const
          ).map(([label, key, ph]) => (
            <label key={key} style={{ display: 'block' }}>
              <span className="text-2" style={{ fontSize: 13 }}>
                {label}
              </span>
              <input
                value={manualForm[key]}
                placeholder={ph}
                inputMode={key === 'label' ? 'text' : 'decimal'}
                onChange={(ev) => setManualForm({ ...manualForm, [key]: ev.target.value })}
                style={{
                  width: '100%',
                  minHeight: 48,
                  marginTop: 6,
                  padding: '0 12px',
                  borderRadius: 4,
                  border: '1px solid var(--line-strong)',
                  background: 'var(--bg-raised)',
                  color: 'var(--text-1)',
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          ))}
          <p className="text-3" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            热量按 体重 × 距离 估算（{settings.weightKg}kg × 距离 ≈ 大卡）；只有时长就按 8 大卡/分钟。
          </p>
          <PrimaryButton
            onClick={() => {
              const minutes = Number(manualForm.minutes) || 0;
              const distanceKm = Number(manualForm.distanceKm) || undefined;
              const kcal = estimateRunKcal(settings.weightKg, distanceKm ?? null, minutes || null);
              if (kcal <= 0) {
                toast('至少填距离或时长一项');
                return;
              }
              saveEntry(manualForm.label || '跑步', minutes, kcal, distanceKm, 'manual');
              setManualOpen(false);
              setManualForm({ label: '跑步', distanceKm: '', minutes: '' });
            }}
          >
            入账
          </PrimaryButton>
        </div>
      </BottomSheet>
    </div>
  );
}

/** 运动记录显示名：有标题用标题，否则按类型翻中文 */
function labelOf(s: HealthSession): string {
  if (s.title && s.title !== s.exerciseType) return s.title;
  const map: Record<string, string> = {
    RUNNING: '跑步',
    RUNNING_JOGGING: '慢跑',
    RUNNING_SPRINTING: '跑步',
    WALKING: '走路',
    TREADMILL: '跑步机',
    ELLIPTICAL: '椭圆机',
    BIKING: '骑行',
    EXERCISE_CLASS: '健身课',
  };
  const cn = map[s.exerciseType];
  return cn ?? '运动';
}
