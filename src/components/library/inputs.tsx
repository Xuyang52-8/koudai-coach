/**
 * 表单基础控件（动作库自建表单 + 设置页共用）：
 * Field 输入框 / FieldArea 多行 / Stepper −数字+ / RowToggle 开关。
 * 规格：输入框 56px、--bg-inset 底、1px --line-strong、radius 4px；开关 pill、200ms 滑动。
 */
import { motion } from 'framer-motion';
import type { CSSProperties, JSX, ReactNode } from 'react';

/* ================= 输入框 ================= */

const INPUT_BASE: CSSProperties = {
  width: '100%',
  minHeight: 56,
  background: 'var(--bg-inset)',
  border: '1px solid var(--line-strong)',
  borderRadius: 4,
  padding: '0 14px',
  fontSize: 16,
  color: 'var(--text-1)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
};

export interface FieldProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  /** 右侧附加位（眼睛切换等） */
  right?: ReactNode;
  /** 保存成功等时刻让描边 accent 闪一下 */
  flash?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'url';
}

export function Field({ label, value, onChange, placeholder, type = 'text', right, flash, inputMode }: FieldProps): JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      {label ? (
        <span
          className="font-display font-semibold uppercase text-3"
          style={{ display: 'block', fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
        >
          {label}
        </span>
      ) : null}
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          type={type}
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...INPUT_BASE,
            paddingRight: right ? 52 : 14,
            borderColor: flash ? 'var(--accent)' : 'var(--line-strong)',
            transition: 'border-color 300ms',
          }}
        />
        {right ? (
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}>
            {right}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export interface FieldAreaProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

export function FieldArea({ label, value, onChange, placeholder, rows = 3 }: FieldAreaProps): JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      {label ? (
        <span
          className="font-display font-semibold uppercase text-3"
          style={{ display: 'block', fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
        >
          {label}
        </span>
      ) : null}
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...INPUT_BASE,
          minHeight: 0,
          padding: '12px 14px',
          lineHeight: 1.6,
          resize: 'vertical',
        }}
      />
    </label>
  );
}

/* ================= 步进器（− 数字 +） ================= */

export interface StepperProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 数字后单位，如 "kg"、"组" */
  unit?: string;
  /** 小数位（体重 0.1 用） */
  decimals?: number;
}

export function Stepper({ label, value, onChange, min = 0, max = 999, step = 1, unit, decimals = 0 }: StepperProps): JSX.Element {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(decimals))));
  const btn: CSSProperties = {
    width: 56,
    height: 56,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--line-strong)',
    borderRadius: 4,
    color: 'var(--text-1)',
    fontSize: 26,
    fontWeight: 500,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };
  return (
    <div>
      {label ? (
        <div
          className="font-display font-semibold uppercase text-3"
          style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
        >
          {label}
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <motion.button
          type="button"
          aria-label="减少"
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.12 }}
          style={btn}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </motion.button>
        <div
          className="num"
          style={{
            flex: 1,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: 'var(--bg-inset)',
            border: '1px solid var(--line-strong)',
            borderRadius: 4,
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--text-1)',
          }}
        >
          <motion.span key={value} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
            {value.toFixed(decimals)}
          </motion.span>
          {unit ? <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-2)' }}>{unit}</span> : null}
        </div>
        <motion.button
          type="button"
          aria-label="增加"
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.12 }}
          style={btn}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </motion.button>
      </div>
    </div>
  );
}

/* ================= 开关（pill，200ms 滑动） ================= */

export interface RowToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function RowToggle({ on, onChange, label, disabled }: RowToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 56,
        height: 32,
        borderRadius: 999,
        border: 'none',
        padding: 3,
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        background: on ? 'var(--accent)' : 'var(--line-strong)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background 200ms',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <motion.span
        layout
        transition={{ duration: 0.2 }}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: on ? 'var(--on-accent)' : 'var(--text-2)',
          display: 'block',
        }}
      />
    </button>
  );
}
