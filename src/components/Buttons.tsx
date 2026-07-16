/**
 * 按钮系统：全部 ≥56px 高（sm=48 仅用于次要行内场景）、radius 4px、font 600 16px、按压 scale .97。
 * 为汗手设计：通栏、大目标。左图标（20px SVG）+ 文字，右端可接小字副标。
 *
 * 用法：
 *   <PrimaryButton icon={<Icon name="play" size={20}/>} onClick={...}>开始训练</PrimaryButton>
 *   <GhostButton size="sm" right={<Icon name="arrow-right" size={16}/>}>先去路上预习动作</GhostButton>
 *   <WarnButton>跳过休息</WarnButton>
 *   <DangerButton>清空数据</DangerButton>
 */
import { motion } from 'framer-motion';
import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 48, md: 56, lg: 64 };
const SIZE_FONT: Record<ButtonSize, number> = { sm: 15, md: 16, lg: 18 };

export interface AppButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'style' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'
  > {
  /** 左端图标（20px SVG） */
  icon?: ReactNode;
  /** 右端小字副标或小图标，如 "60 秒" */
  right?: ReactNode;
  size?: ButtonSize;
  /** 默认通栏 true */
  fullWidth?: boolean;
  /** 追加内联样式（与基础样式合并） */
  style?: CSSProperties;
}

interface VariantSpec {
  background: string;
  color: string;
  border: string;
  /** CSS :active 背景（主 CTA 按压 accent→accent-hi） */
  activeBackground?: string;
}

const VARIANTS = {
  primary: {
    background: 'var(--accent)',
    color: '#060607',
    border: 'none',
    activeBackground: 'var(--accent-hi)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-1)',
    border: '1px solid var(--line-strong)',
  },
  warn: {
    background: 'var(--warn-dim)',
    color: 'var(--warn)',
    border: 'none',
  },
  danger: {
    background: 'var(--danger-dim)',
    color: 'var(--danger)',
    border: 'none',
  },
} as const satisfies Record<string, VariantSpec>;

type Variant = keyof typeof VARIANTS;

function BaseButton({
  variant,
  icon,
  right,
  size = 'md',
  fullWidth = true,
  className,
  children,
  type = 'button',
  disabled,
  style,
  ...rest
}: AppButtonProps & { variant: Variant }): JSX.Element {
  const v = VARIANTS[variant];
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      type={type}
      disabled={disabled}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: fullWidth ? '100%' : undefined,
        minHeight: SIZE_HEIGHT[size],
        padding: '0 18px',
        borderRadius: 4,
        fontSize: SIZE_FONT[size],
        fontWeight: size === 'lg' ? 700 : 600,
        fontFamily: size === 'lg' ? 'var(--font-display)' : 'var(--font-body)',
        letterSpacing: size === 'lg' ? '0.02em' : undefined,
        background: v.background,
        color: v.color,
        border: v.border,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        ...style,
      }}
      {...rest}
    >
      {icon ? <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span> : null}
      <span style={{ flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {right ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: 'auto',
            fontSize: 13,
            fontWeight: 500,
            opacity: 0.75,
            flexShrink: 0,
          }}
        >
          {right}
        </span>
      ) : null}
    </motion.button>
  );
}

/** accent 底 / #060607 字 / 通栏。按压 accent-hi + scale .97 */
export function PrimaryButton(props: AppButtonProps): JSX.Element {
  const { className, ...rest } = props;
  return (
    <BaseButton
      variant="primary"
      className={`transition-colors active:bg-[#6FF5CB] ${className ?? ''}`}
      {...rest}
    />
  );
}

/** 透明底 / 1px --line-strong 描边 / --text-1 字 */
export function GhostButton(props: AppButtonProps): JSX.Element {
  const { className, ...rest } = props;
  return (
    <BaseButton
      variant="ghost"
      className={`transition-colors active:bg-[rgba(244,244,242,0.06)] ${className ?? ''}`}
      {...rest}
    />
  );
}

/** warn-dim 底 / warn 字（次危险操作，如"跳过休息"） */
export function WarnButton(props: AppButtonProps): JSX.Element {
  const { className, ...rest } = props;
  return (
    <BaseButton
      variant="warn"
      className={`transition-colors active:bg-[rgba(255,178,36,0.2)] ${className ?? ''}`}
      {...rest}
    />
  );
}

/** danger-dim 底 / danger 字（如"清空数据"） */
export function DangerButton(props: AppButtonProps): JSX.Element {
  const { className, ...rest } = props;
  return (
    <BaseButton
      variant="danger"
      className={`transition-colors active:bg-[rgba(255,92,69,0.2)] ${className ?? ''}`}
      {...rest}
    />
  );
}

export default PrimaryButton;
