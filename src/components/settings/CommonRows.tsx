/**
 * 「常用」组新增行：
 * - EquipmentRow 我的器械入口 → /equipment
 * - NotifyRow 训练提醒：开关 + 整点 chips + 自定义 HH:mm
 * 契约（types.ts AppSettings）：notifyOn?: boolean 默认 false · notifyTime?: string 默认 '18:00'。
 */
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useNavigate } from 'react-router';
import { vibrate } from '@/components/feedback';
import Icon from '@/components/Icon';
import { RowToggle } from '@/components/library/inputs';
import { updateSettings, useSettings } from '@/lib/store';
import { syncReminder, syncSedentary } from '@/lib/notify';
import { Caption } from './common';

/** 我的器械入口行：整行可点 → /equipment */
export function EquipmentRow(): JSX.Element {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        vibrate(15);
        navigate('/equipment');
      }}
      style={{
        width: '100%',
        minHeight: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'transparent',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        <Icon name="dumbbell" size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-1" style={{ fontSize: 17, fontWeight: 500 }}>
          我的器械
        </div>
        <Caption>你健身房的器械清单，没器械的动作自动替换</Caption>
      </div>
      <span aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--text-3)' }}>
        <Icon name="arrow-right" size={18} />
      </span>
    </button>
  );
}

/** 动作库入口行：整行可点 → /library（TabBar 精简后收纳于此） */
export function LibraryRow(): JSX.Element {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        vibrate(15);
        navigate('/library');
      }}
      style={{
        width: '100%',
        minHeight: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'transparent',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        <Icon name="book" size={22} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-1" style={{ fontSize: 17, fontWeight: 500 }}>
          动作库
        </div>
        <Caption>67 个动作的六要素详解，也能自建动作</Caption>
      </div>
      <span aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--text-3)' }}>
        <Icon name="arrow-right" size={18} />
      </span>
    </button>
  );
}

/* ================= 训练提醒 ================= */

const TIME_PRESETS = ['17:00', '18:00', '19:00', '20:00'] as const;
/** HH:mm 合法时间（00:00–23:59） */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function chipStyle(active: boolean): CSSProperties {
  return {
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 4,
    border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
    background: active ? 'var(--accent-dim)' : 'transparent',
    color: active ? 'var(--accent-ink)' : 'var(--text-1)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    transition: 'border-color 150ms, background 150ms, color 150ms',
  };
}

/** 训练提醒行：开关 + 时间选择（17:00/18:00/19:00/20:00 chips + 自定义输入），行尾小字「仅安卓 App 生效」 */
export function NotifyRow(): JSX.Element {
  const [settings] = useSettings();
  const notifyOn = settings.notifyOn ?? false;
  const notifyTime = settings.notifyTime ?? '18:00';
  const isPreset = (TIME_PRESETS as readonly string[]).includes(notifyTime);
  const [draft, setDraft] = useState(isPreset ? '' : notifyTime);
  const [bad, setBad] = useState(false);

  const pick = (t: string) => {
    updateSettings({ notifyTime: t });
    void syncReminder();
    setDraft('');
    setBad(false);
    vibrate(15);
  };

  /** 失焦/回车提交自定义时间：合法 HH:mm 才写入，非法标红不存 */
  const commitDraft = () => {
    const t = draft.trim();
    if (!t) {
      setBad(false);
      return;
    }
    if (TIME_RE.test(t)) {
      updateSettings({ notifyTime: t });
      void syncReminder();
      setBad(false);
      vibrate(15);
    } else {
      setBad(true);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>训练提醒</div>
          <Caption>每天到点叫你起来练</Caption>
        </div>
        <RowToggle on={notifyOn} onChange={(on) => { updateSettings({ notifyOn: on }); void syncReminder(); }} label="训练提醒" />
      </div>
      {notifyOn ? (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {TIME_PRESETS.map((t) => (
            <button key={t} type="button" onClick={() => pick(t)} style={chipStyle(notifyTime === t)}>
              <span className="num" style={{ fontSize: 15 }}>
                {t}
              </span>
            </button>
          ))}
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setBad(false);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
            placeholder="自定义"
            inputMode="numeric"
            aria-label="自定义提醒时间，格式如 18:30"
            style={{
              width: 92,
              minHeight: 44,
              textAlign: 'center',
              background: 'var(--bg-inset)',
              border: `1px solid ${bad ? 'var(--danger)' : !isPreset ? 'var(--accent)' : 'var(--line-strong)'}`,
              borderRadius: 4,
              fontSize: 15,
              color: 'var(--text-1)',
              fontFamily: 'var(--font-body)',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
        </div>
      ) : null}
      {bad ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--danger)' }}>
          时间格式像这样：18:30（24 小时制）
        </p>
      ) : null}
      <Caption>仅安卓 App 生效</Caption>
    </div>
  );
}

/* ================= 提醒自检（v1.5：通知不响的破案三件套） ================= */

import { getNotifyStatus, openExactAlarmSettings, sendTestNotification } from '@/lib/notify';

/** 状态小字： granted=绿 denied=红 prompt/unknown=灰 */
function StatusLine({ label, value }: { label: string; value: 'granted' | 'denied' | 'prompt' | 'unknown' }): JSX.Element {
  const map = {
    granted: { text: '已开启', color: 'var(--accent-ink)' },
    denied: { text: '被禁止', color: 'var(--danger)' },
    prompt: { text: '未询问', color: 'var(--text-3)' },
    unknown: { text: '未知', color: 'var(--text-3)' },
  } as const;
  const v = map[value];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, lineHeight: 1.8 }}>
      <span className="text-2">{label}</span>
      <span style={{ color: v.color, fontWeight: 500 }}>{v.text}</span>
    </div>
  );
}

const SELF_CHECK_BTN: CSSProperties = {
  minHeight: 48,
  padding: '0 14px',
  borderRadius: 4,
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text-1)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  textAlign: 'left',
};

/**
 * 提醒自检行：通知不响时自己破案——
 * ①权限/精确闹钟状态一眼看 ②发测试通知当场验证 ③跳系统设置开精确闹钟
 * ④国产 ROM 文字引导（自启动/无限制省电，各品牌路径不同没法一键跳）
 */
export function NotifySelfCheckRow(): JSX.Element {
  const [status, setStatus] = useState<{ native: boolean; permission: 'granted' | 'denied' | 'prompt' | 'unknown'; exactAlarm: 'granted' | 'denied' | 'unknown' } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setStatus(await getNotifyStatus());
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>提醒自检</div>
          <Caption>提醒不响时点这里破案：查权限、发测试通知</Caption>
        </div>
        <button type="button" style={SELF_CHECK_BTN} onClick={() => { vibrate(15); void refresh(); }}>
          检查状态
        </button>
      </div>
      {status ? (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {!status.native ? (
            <Caption>当前是网页版，网页没有定时通知能力——提醒功能只在安卓 App 里生效。</Caption>
          ) : (
            <>
              <StatusLine label="通知权限" value={status.permission} />
              <StatusLine label="精确闹钟（安卓12+必需）" value={status.exactAlarm} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={SELF_CHECK_BTN}
                  disabled={testing}
                  onClick={() => {
                    vibrate(15);
                    setTesting(true);
                    setTestResult(null);
                    void sendTestNotification().then((ok) => {
                      setTesting(false);
                      setTestResult(ok ? '已发出，1.5 秒后看通知栏' : '发不出去，先去开通知权限');
                    });
                  }}
                >
                  {testing ? '发送中…' : '发一条测试通知'}
                </button>
                {status.exactAlarm === 'denied' ? (
                  <button type="button" style={SELF_CHECK_BTN} onClick={() => { vibrate(15); void openExactAlarmSettings(); }}>
                    去开"精确闹钟"
                  </button>
                ) : null}
              </div>
              {testResult ? <Caption>{testResult}</Caption> : null}
              <Caption>
                测试通知能收到但定时提醒还是不响？那是手机省电策略在杀后台：去系统设置 → 应用管理 → 口袋私教，
                开「自启动」、省电策略选「无限制」（小米/华为/OPPO/vivo 路径略有不同，都在应用管理里）。
              </Caption>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 久坐提醒开关（v1.6）：每 2 小时一条，9-21 点，仅安卓 App */
export function SedentaryRow(): JSX.Element {
  const [settings] = useSettings();
  const on = settings.sedentaryOn ?? false;
  return (
    <div>
      <RowToggle
        on={on}
        onChange={(next) => {
          updateSettings({ sedentaryOn: next });
          void syncSedentary();
        }}
        label="久坐提醒"
      />
      <Caption>加班久坐党的腰和眼都靠它：9 点到 21 点每 2 小时喊你起来活动 2 分钟。仅安卓 App 生效。</Caption>
    </div>
  );
}
