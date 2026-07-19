/**
 * BottomSheet：底部弹层（动作详情 / 食物估算结果 / 补剂打卡 / 自建表单）。
 * translateY 100%→0，280ms cubic-bezier(.32,.72,0,1)；遮罩 opacity 0→.6；
 * 顶部 4px×36px 把手；圆角仅顶部 12px；max-height 85vh；内部滚动。
 *
 * 用法：
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="肌酸打卡">
 *     ...内容...
 *   </BottomSheet>
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { JSX, ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** 可选小标题（label 样式） */
  title?: string;
  children: ReactNode;
}

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.28 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'var(--scrim)' }}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.28, ease: EASE }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxWidth: 480,
              margin: '0 auto',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-raised)',
              border: '1px solid var(--line)',
              borderBottom: 'none',
              borderRadius: '12px 12px 0 0',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--line-strong)' }} />
            </div>
            {title ? (
              <div
                className="font-display font-semibold uppercase text-3"
                style={{ fontSize: 13, letterSpacing: '0.14em', padding: '4px 20px 10px' }}
              >
                {title}
              </div>
            ) : null}
            <div style={{ overflowY: 'auto', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default BottomSheet;
