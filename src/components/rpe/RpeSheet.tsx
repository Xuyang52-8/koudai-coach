/**
 * RpeSheet：练完一个动作弹出的 RPE 评价弹层。
 * 三个通栏大按钮（竖排，≥56px，主文 + caption 两行）：
 *   太轻松（accent，下次加点量）/ 刚好（默认，保持现状）/ 太累（warn，下次减点量，姿势先对）
 * 外加一个小的「跳过」文字按钮（不记录）。
 * 选完由父层负责：存覆盖记录 + toast 反馈 + 收起 + 推进到下一动作。
 *
 * 用法：
 *   <RpeSheet open={target !== null} exerciseName={target?.name ?? ''} onSelect={handleRpe} onSkip={handleSkip} />
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import type { RpeChoice } from '@/lib/adjust';

interface RpeButtonSpec {
  rpe: RpeChoice;
  label: string;
  caption: string;
  background: string;
  color: string;
  border: string;
}

const BUTTONS: RpeButtonSpec[] = [
  { rpe: 'easy', label: '太轻松', caption: '下次加点量', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' },
  { rpe: 'ok', label: '刚好', caption: '保持现状', background: 'transparent', color: 'var(--text-1)', border: '1px solid var(--line-strong)' },
  { rpe: 'hard', label: '太累', caption: '下次减点量，姿势先对', background: 'var(--warn-dim)', color: 'var(--warn)', border: 'none' },
];

function RpeButton({ spec, onSelect }: { spec: RpeButtonSpec; onSelect: (rpe: RpeChoice) => void }): JSX.Element {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      onClick={() => onSelect(spec.rpe)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        width: '100%',
        minHeight: 64,
        padding: '8px 18px',
        borderRadius: 4,
        background: spec.background,
        color: spec.color,
        border: spec.border,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{spec.label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, opacity: 0.72 }}>{spec.caption}</span>
    </motion.button>
  );
}

export interface RpeSheetProps {
  open: boolean;
  /** 刚完成的动作名（收起动画期间组件内部记住上一个非空名，不闪空标题） */
  exerciseName: string;
  /** 三档评价之一：父层存记录 + toast + 收起 */
  onSelect: (rpe: RpeChoice) => void;
  /** 跳过 / 点遮罩：不记录，直接收起 */
  onSkip: () => void;
}

export function RpeSheet({ open, exerciseName, onSelect, onSkip }: RpeSheetProps): JSX.Element {
  /* render 期间调整 state（官方模式）：只记住非空名，退出动画不闪空 */
  const [lastName, setLastName] = useState(exerciseName);
  if (exerciseName && exerciseName !== lastName) setLastName(exerciseName);
  const shown = exerciseName || lastName;

  let question: ReactNode = '这个动作感觉怎么样？';
  if (shown) {
    question = <>「{shown}」感觉怎么样？</>;
  }

  return (
    <BottomSheet open={open} onClose={onSkip} title="练完反馈">
      <h3 className="text-1" style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>
        {question}
      </h3>
      <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        照实说，下次的重量和次数会跟着变。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {BUTTONS.map((spec) => (
          <RpeButton key={spec.rpe} spec={spec} onSelect={onSelect} />
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="text-3"
        style={{
          display: 'block',
          margin: '10px auto 0',
          minHeight: 44,
          padding: '0 16px',
          background: 'none',
          border: 'none',
          fontSize: 13,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        跳过，这次不评
      </button>
    </BottomSheet>
  );
}

export default RpeSheet;
