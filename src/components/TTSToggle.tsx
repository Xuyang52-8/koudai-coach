/**
 * TTSToggle：喇叭 SVG 开关。开=accent，关=--text-3。状态全局持久化（settings.ttsOn）。
 * 所有朗读入口服从此开关。训练页可放更大号（size 属性）。
 */
import type { JSX } from 'react';
import { updateSettings, useSettings } from '../lib/store';
import { cancel, speak } from '../lib/tts';
import { Icon } from './Icon';

export interface TTSToggleProps {
  size?: number;
  className?: string;
}

export function TTSToggle({ size = 24, className }: TTSToggleProps): JSX.Element {
  const [settings] = useSettings();
  const on = settings.ttsOn;
  return (
    <button
      type="button"
      aria-label={on ? '关闭语音' : '打开语音'}
      aria-pressed={on}
      className={className}
      onClick={() => {
        if (on) {
          cancel();
          updateSettings({ ttsOn: false });
        } else {
          updateSettings({ ttsOn: true });
          // 在用户手势里立即朗读确认：既给反馈又解锁移动端语音
          speak('语音已开启，我是你的口袋私教', { force: true });
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: Math.max(40, size + 16),
        height: Math.max(40, size + 16),
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: on ? 'var(--accent-ink)' : 'var(--text-3)',
        transition: 'color 150ms',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon name={on ? 'tts-on' : 'tts-off'} size={size} />
    </button>
  );
}

export default TTSToggle;
