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
        <RowToggle on={notifyOn} onChange={(on) => updateSettings({ notifyOn: on })} label="训练提醒" />
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
