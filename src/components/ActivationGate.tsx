/**
 * 激活门（v1.7 · 方案A）：首次打开 App 必须输入邀请码。
 * 全屏品牌页 + 码输入 + 校验；通过后写入本地，永不再问（除非清空数据）。
 */
import { useState } from 'react';
import type { JSX } from 'react';
import { activate } from '../lib/license';
import { vibrate } from './feedback';
import { PrimaryButton } from './Buttons';

export default function ActivationGate({ onActivated }: { onActivated: () => void }): JSX.Element {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const submit = (): void => {
    if (activate(code)) {
      vibrate(30);
      onActivated();
    } else {
      vibrate([40, 60, 40]);
      setError(true);
    }
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
      }}
    >
      <div className="font-display" style={{ fontSize: 15, letterSpacing: '0.2em', color: 'var(--text-3)' }}>
        POCKET COACH
      </div>
      <h1 className="font-display" style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700, color: 'var(--text-1)' }}>
        口袋私教
      </h1>
      <p className="text-2" style={{ margin: '18px 0 0', fontSize: 14, lineHeight: 1.7, maxWidth: 300 }}>
        邀请制内测中。输入邀请码开始使用，没有码？找分享给你的朋友要一个。
      </p>
      <input
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="KD-XXXX-XXXX-XX"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="num"
        style={{
          marginTop: 26,
          width: '100%',
          maxWidth: 320,
          padding: '14px 16px',
          fontSize: 20,
          letterSpacing: '0.08em',
          textAlign: 'center',
          background: 'var(--bg-inset)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`,
          borderRadius: 4,
          color: 'var(--text-1)',
          outline: 'none',
        }}
      />
      {error ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--danger)' }}>
          码不对，检查一下再试（注意别多空格）。
        </p>
      ) : null}
      <div style={{ marginTop: 22, width: '100%', maxWidth: 320 }}>
        <PrimaryButton size="lg" onClick={submit}>
          激活并开始
        </PrimaryButton>
      </div>
    </div>
  );
}
