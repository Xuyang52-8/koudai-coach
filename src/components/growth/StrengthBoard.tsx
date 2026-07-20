/**
 * 力量成长线板块：每个被 RPE 调过 / 有手动重量记录的动作一张小卡。
 * 卡 = 动作名 + 当前生效量（Oswald 大数字）+ 历史行（日期 重量×次数，最多 5 条）+ 人话点评。
 * 空态：「练几次 RPE 后这里会长出你的力量曲线」。
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { JSX } from 'react';
import EmptyState from '../EmptyState';
import { formatKg } from '../workout/weight';
import type { StrengthCardData, StrengthRecord, StrengthTrend } from '../../lib/growth';

/** 单条历史行：负重 "12.5kg × 10-12"，自重 "自重 × 14-17" */
function recordLabel(r: StrengthRecord): string {
  return r.kg !== null ? `${formatKg(r.kg)} × ${r.reps}` : `自重 × ${r.reps}`;
}

/** 调整量列：+2.5kg / -2.5kg / +2次 / 持平 */
function deltaLabel(r: StrengthRecord, weighted: boolean): string {
  if (r.delta === 0) return '持平';
  const sign = r.delta > 0 ? '+' : '';
  return weighted ? `${sign}${formatKg(r.delta)}` : `${sign}${r.delta} 次`;
}

const TREND_COLOR: Record<StrengthTrend, string> = {
  up: 'var(--accent-ink)',
  flat: 'var(--text-2)',
  down: 'var(--warn)',
};

function StrengthCard({ card, index }: { card: StrengthCardData; index: number }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.article
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--line-strong)',
        borderRadius: 4,
        padding: '14px 16px',
      }}
    >
      {/* 头：动作名 + 当前生效量 */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h3 className="text-1" style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
          {card.name}
        </h3>
        <span className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: 'var(--accent-ink)', whiteSpace: 'nowrap' }}>
          {card.currentLabel}
        </span>
      </div>

      {/* 历史行（最多 5 条，旧→新） */}
      {card.records.length > 0 ? (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)' }}>
          {card.records.map((r) => (
            <div
              key={`${r.date}-${r.rpe}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)' }}
            >
              <span className="num text-3" style={{ fontSize: 12, lineHeight: 1, flexShrink: 0, width: 40 }}>
                {r.date.slice(5).replace('-', '/')}
              </span>
              <span className="num text-1" style={{ flex: 1, fontSize: 15, lineHeight: 1.2 }}>
                {recordLabel(r)}
              </span>
              <span
                className="num"
                style={{
                  fontSize: 13,
                  lineHeight: 1,
                  flexShrink: 0,
                  color: r.delta > 0 ? 'var(--accent-ink)' : r.delta < 0 ? 'var(--warn)' : 'var(--text-3)',
                }}
              >
                {deltaLabel(r, card.weighted)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* 人话点评 */}
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: TREND_COLOR[card.trend] }}>
        {card.verdict}
        {card.totalCount > 0 ? <span className="text-3"> · 共 {card.totalCount} 次评价</span> : null}
      </p>
    </motion.article>
  );
}

export interface StrengthBoardProps {
  cards: StrengthCardData[];
}

export function StrengthBoard({ cards }: StrengthBoardProps): JSX.Element {
  if (cards.length === 0) {
    return (
      <div style={{ marginTop: 14 }}>
        <EmptyState text="练几次 RPE 后这里会长出你的力量曲线" />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
      {cards.map((card, i) => (
        <StrengthCard key={card.exerciseId} card={card} index={i} />
      ))}
    </div>
  );
}

export default StrengthBoard;
