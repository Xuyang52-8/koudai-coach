/**
 * 训练日历板块：当月 42 格（周一开头）+ 左右翻月 + 点格子弹当天摘要。
 * 点色：训练=薄荷绿实心点 · 小练=黄点 · 休息打卡=灰点（全部走 CSS 变量，双主题兼容）。
 * 数据来自 lib/growth.ts 的 buildMonthCalendar / buildDayDetail（纯函数）。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import BottomSheet from '../BottomSheet';
import Icon from '../Icon';
import { vibrate } from '../feedback';
import { buildDayDetail } from '../../lib/growth';
import type { CalendarInput, DayDetail, DayKind, MonthCalendar } from '../../lib/growth';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const DOT_COLOR: Record<DayKind, string> = {
  workout: 'var(--accent)',
  mini: 'var(--warn)',
  rest: 'var(--text-3)',
};

function weekdayLabel(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `周${'日一二三四五六'[d.getDay()]}`;
}

function navBtnStyle(enabled: boolean): CSSProperties {
  return {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--line-strong)',
    borderRadius: 4,
    color: enabled ? 'var(--text-1)' : 'var(--text-3)',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.4,
    WebkitTapHighlightColor: 'transparent',
  };
}

/* ================= 当天摘要弹层 ================= */

function DaySheet({ detail, onClose }: { detail: DayDetail | null; onClose: () => void }): JSX.Element {
  /* render 期间调整 state（同 RpeSheet 模式）：收起动画期间记住上次内容，不闪空 */
  const [last, setLast] = useState<DayDetail | null>(detail);
  if (detail && detail !== last) setLast(detail);
  const shown = detail ?? last;
  return (
    <BottomSheet open={detail !== null} onClose={onClose} title="当天摘要">
      {shown ? (
        <div style={{ paddingBottom: 4 }}>
          <h3 className="text-1" style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600, lineHeight: 1.4 }}>
            {Number(shown.date.slice(5, 7))} 月 {Number(shown.date.slice(8, 10))} 日 · {weekdayLabel(shown.date)}
          </h3>
          <div style={{ marginTop: 12 }}>
            {shown.workouts.map((w) => (
              <div
                key={w.workoutId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ color: 'var(--accent-ink)', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon name="dumbbell" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-1" style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                    第 {w.lessonNumber} 课 · {w.subtitle}
                  </p>
                  <p className="text-2" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                    {w.title} · 约 {w.minutes} 分钟 · 约 {w.kcal} 大卡
                  </p>
                </div>
              </div>
            ))}
            {shown.restKcal !== null ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ color: 'var(--text-3)', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon name="waves" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-1" style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                    主动恢复打卡
                  </p>
                  <p className="text-2" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                    休息日也算坚持{shown.restKcal > 0 ? ` · 约 ${shown.restKcal} 大卡` : ''}
                  </p>
                </div>
              </div>
            ) : null}
            {shown.minis.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                <span style={{ color: 'var(--warn)', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon name="timer" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-1" style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                    小练 {shown.minis.length} 套
                  </p>
                  <p className="text-2" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                    {shown.minis.join('、')}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          {shown.kcalTotal > 0 ? (
            <p className="text-3" style={{ margin: '12px 0 0', fontSize: 13 }}>
              当天总消耗约 <span className="num" style={{ color: 'var(--accent-ink)' }}>{shown.kcalTotal}</span>{' '}
              大卡（估算值，看个大概）
            </p>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

/* ================= 日历板块 ================= */

export interface CalendarBoardProps {
  cal: MonthCalendar;
  input: CalendarInput;
  /** 能否往后翻（不越过当前月） */
  canNext: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function CalendarBoard({ cal, input, canNext, onPrevMonth, onNextMonth }: CalendarBoardProps): JSX.Element {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const detail = selected ? buildDayDetail(selected, input) : null;

  return (
    <div>
      {/* 月份翻页头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <button
          type="button"
          aria-label="上一个月"
          onClick={() => {
            vibrate(15);
            onPrevMonth();
          }}
          style={navBtnStyle(true)}
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <span className="font-display font-semibold text-1" style={{ fontSize: 20, letterSpacing: '0.02em' }}>
          {cal.label}
        </span>
        <button
          type="button"
          aria-label="下一个月"
          disabled={!canNext}
          onClick={() => {
            if (!canNext) return;
            vibrate(15);
            onNextMonth();
          }}
          style={navBtnStyle(canNext)}
        >
          <Icon name="arrow-right" size={18} />
        </button>
      </div>

      {/* 星期头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 14 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-3" style={{ textAlign: 'center', fontSize: 11, lineHeight: '20px' }}>
            {w}
          </div>
        ))}
      </div>

      {/* 42 格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 4 }}>
        {cal.cells.map((cell, i) => {
          if (!cell.inMonth) return <div key={cell.date} style={{ minHeight: 44 }} />;
          const clickable = cell.kind !== null && !cell.isFuture;
          return (
            <motion.button
              key={cell.date}
              type="button"
              initial={reduce ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0.1 } : { delay: Math.min(i * 0.006, 0.25), duration: 0.18 }}
              disabled={!clickable}
              onClick={() => {
                vibrate(15);
                setSelected(cell.date);
              }}
              aria-label={`${cell.date}${cell.kind ? '，查看当天摘要' : ''}`}
              style={{
                minHeight: 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                background: cell.isToday ? 'var(--accent-dim)' : 'transparent',
                border: cell.isToday ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 4,
                cursor: clickable ? 'pointer' : 'default',
                WebkitTapHighlightColor: 'transparent',
                padding: 0,
              }}
            >
              <span
                className="num"
                style={{
                  fontSize: 13,
                  fontWeight: cell.isToday ? 600 : 400,
                  lineHeight: 1,
                  color: cell.isFuture ? 'var(--text-3)' : cell.isToday ? 'var(--accent-ink)' : 'var(--text-1)',
                }}
              >
                {cell.day}
              </span>
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: cell.kind ? DOT_COLOR[cell.kind] : 'transparent',
                }}
              />
            </motion.button>
          );
        })}
      </div>

      {/* 图例 + 月度统计 */}
      <p className="text-2" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        <span style={{ color: 'var(--accent-ink)' }}>●</span> 训练 {cal.workoutDays} 天 ·{' '}
        <span style={{ color: 'var(--warn)' }}>●</span> 小练 {cal.miniDays} 天 ·{' '}
        <span style={{ color: 'var(--text-3)' }}>●</span> 休息打卡 {cal.restDays} 天
      </p>

      <DaySheet detail={detail} onClose={() => setSelected(null)} />
    </div>
  );
}

export default CalendarBoard;
