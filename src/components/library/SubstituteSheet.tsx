/**
 * 替代动作选择 BottomSheet（Preview / Workout 共用）。
 * 列出原动作的有序替代链（第一个 = 最优替代）：名称 + 肌肉 + 场地 Tag + 一句话在哪找。
 * 已替换过的位置显示「当前 X → 可换回原动作 Y」，一键换回。
 */
import { motion } from 'framer-motion';
import type { JSX } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { GhostButton } from '@/components/Buttons';
import Icon from '@/components/Icon';
import Tag from '@/components/Tag';
import type { Exercise } from '@/lib/types';
import { getExerciseById } from '@/lib/utils-workout';
import { VENUE_LABELS, primaryVenue } from './venues';

/** 交换箭头（Icon.tsx 无此图标，按规格自绘：24×24 viewBox · 2px 描边 · currentColor） */
export function SwapIcon({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h13" />
      <path d="m14 3 4 4-4 4" />
      <path d="M20 17H7" />
      <path d="m10 21-4-4 4-4" />
    </svg>
  );
}

export interface SubstituteSheetProps {
  open: boolean;
  onClose: () => void;
  /** 该位置的原动作（替代链的来源）；null 时不渲染内容 */
  original: Exercise | null;
  /** 当前实际在练/在看的动作（被替换过就是替代动作）；缺省 = original */
  current?: Exercise | null;
  /** 点选某个替代动作 */
  onSwap: (ex: Exercise) => void;
  /** 一键换回原动作 */
  onRevert: () => void;
}

export function SubstituteSheet({ open, onClose, original, current, onSwap, onRevert }: SubstituteSheetProps): JSX.Element {
  const cur = current ?? original;
  const subs: Exercise[] = [];
  if (original?.substitutes) {
    for (const id of original.substitutes) {
      const hit = getExerciseById(id);
      if (hit) subs.push(hit);
    }
  }
  const swapped = Boolean(original && cur && cur.id !== original.id);

  return (
    <BottomSheet open={open} onClose={onClose} title="换替代动作">
      {original && cur ? (
        <div style={{ paddingBottom: 8 }}>
          <p className="text-2" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            器械被占了？「{original.name}」可以换成下面这些，排第一的是最优替代。
          </p>

          {/* 当前状态：当前动作名 → 换成什么 */}
          <div
            style={{
              marginTop: 12,
              background: swapped ? 'var(--accent-dim)' : 'var(--bg-inset)',
              border: `1px solid ${swapped ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 4,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-1)',
            }}
          >
            当前：<span style={{ fontWeight: 600 }}>{cur.name}</span>
            {swapped ? (
              <span className="text-2" style={{ fontSize: 13 }}>
                （这个位置原本是「{original.name}」）
              </span>
            ) : null}
          </div>

          {/* 替代链 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {subs.map((s, i) => {
              const isCurrent = s.id === cur.id;
              const venue = primaryVenue(s);
              return (
                <motion.button
                  key={s.id}
                  type="button"
                  whileTap={isCurrent ? undefined : { scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  disabled={isCurrent}
                  onClick={() => onSwap(s)}
                  aria-label={`换成${s.name}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    minHeight: 56,
                    padding: '10px 14px',
                    background: 'var(--bg-inset)',
                    border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 4,
                    cursor: isCurrent ? 'default' : 'pointer',
                    textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="text-1" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
                        {s.name}
                      </span>
                      {isCurrent ? <Tag>当前</Tag> : i === 0 ? <Tag>最优</Tag> : null}
                    </span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag>{s.muscle}</Tag>
                      {venue ? <Tag>{VENUE_LABELS[venue]}</Tag> : null}
                    </span>
                    <span
                      className="text-2"
                      style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {s.equipment.where}
                    </span>
                  </span>
                  {isCurrent ? null : (
                    <span style={{ color: 'var(--text-3)', display: 'inline-flex', flexShrink: 0 }}>
                      <Icon name="arrow-right" size={18} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
          {subs.length === 0 ? (
            <p className="text-2" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
              这个动作还没配替代链，去动作库挑个练同一块肌肉的也行。
            </p>
          ) : null}

          {/* 一键换回 */}
          {swapped ? (
            <GhostButton style={{ marginTop: 14 }} icon={<SwapIcon size={18} />} onClick={onRevert}>
              换回「{original.name}」
            </GhostButton>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

export default SubstituteSheet;
