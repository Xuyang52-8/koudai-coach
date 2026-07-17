/**
 * Onboarding 选择器（首次问卷 + 设置页档案编辑复用）：
 * - SelectCard 单/多选大卡（≥56px、radius 4px、选中 accent 描边 + accent-dim 底）
 * - Chip 多选 pill（旧伤 / 脂肪分布 / 饮食习惯 / 星期）
 * - 领域选择器：性别/经验/旧伤/左右差/脂肪/目标/饮食/场地/排期/星期
 * 全部是受控组件：value + onChange，不碰 store。
 */
import type { CSSProperties, JSX, ReactNode } from 'react';
import Icon from '../Icon';
import type {
  ExperienceLevel,
  Gender,
  GoalType,
  ScheduleMode,
  UserProfile,
  Venue,
} from '../../lib/types';

export type LeftRightDiff = UserProfile['leftRightDiff'];

/* ================= 基础件 ================= */

/** 字段小标签（Oswald 13px uppercase，--text-3） */
export function PickerLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      className="font-display font-semibold uppercase text-3"
      style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 10 }}
    >
      {children}
    </div>
  );
}

const CARD_BASE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 4,
  width: '100%',
  minHeight: 56,
  padding: '12px 14px',
  borderRadius: 4,
  border: '1px solid var(--line-strong)',
  background: 'var(--bg-raised)',
  color: 'var(--text-1)',
  textAlign: 'left',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'border-color 150ms, background 150ms',
};

/** 单/多选大卡：标题 16px 500 + 可选副标 caption */
export function SelectCard({
  title,
  desc,
  selected,
  onClick,
  right,
}: {
  title: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
  right?: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        ...CARD_BASE,
        border: selected ? '1px solid var(--accent)' : CARD_BASE.border,
        background: selected ? 'var(--accent-dim)' : CARD_BASE.background,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 500, lineHeight: 1.4 }}>{title}</span>
        {right ??
          (selected ? (
            <span style={{ color: 'var(--accent)', display: 'inline-flex', flexShrink: 0 }}>
              <Icon name="check" size={18} strokeWidth={2.5} />
            </span>
          ) : null)}
      </span>
      {desc ? (
        <span className="text-2" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {desc}
        </span>
      ) : null}
    </button>
  );
}

/** 多选 chip（小号选择按钮，radius 4px / 高 48px，与 GhostButton sm 同规格） */
export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        minHeight: 48,
        padding: '0 18px',
        borderRadius: 4,
        border: selected ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
        background: selected ? 'var(--accent-dim)' : 'transparent',
        color: selected ? 'var(--accent)' : 'var(--text-1)',
        fontSize: 15,
        fontWeight: 500,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transition: 'border-color 150ms, background 150ms, color 150ms',
      }}
    >
      {label}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {children}
    </div>
  );
}

export function CardStack({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  );
}

/* ================= 通用多选切换（带互斥项支持） ================= */

function toggleMulti(list: string[], key: string, exclusiveKeys: string[] = []): string[] {
  const has = list.includes(key);
  if (has) return list.filter((k) => k !== key);
  if (exclusiveKeys.includes(key)) return [key]; // 选中互斥项 → 清掉其他
  return [...list.filter((k) => !exclusiveKeys.includes(k)), key]; // 选中普通项 → 清掉互斥项
}

/* ================= 领域选择器 ================= */

export function GenderCards({ value, onChange }: { value: Gender; onChange: (v: Gender) => void }): JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <SelectCard title="男" selected={value === 'male'} onClick={() => onChange('male')} />
      <SelectCard title="女" selected={value === 'female'} onClick={() => onChange('female')} />
    </div>
  );
}

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; title: string; desc: string }[] = [
  { value: 'newbie', title: '纯新手', desc: '没练过，或断断续续没坚持过一个月' },
  { value: 'some', title: '练过几个月', desc: '会一些基础动作，还没形成习惯' },
  { value: 'regular', title: '规律训练', desc: '最近几个月每周都在练' },
];

export function ExperienceCards({
  value,
  onChange,
}: {
  value: ExperienceLevel;
  onChange: (v: ExperienceLevel) => void;
}): JSX.Element {
  return (
    <CardStack>
      {EXPERIENCE_OPTIONS.map((o) => (
        <SelectCard key={o.value} title={o.title} desc={o.desc} selected={value === o.value} onClick={() => onChange(o.value)} />
      ))}
    </CardStack>
  );
}

const INJURY_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '没有旧伤' },
  { value: 'waist', label: '腰' },
  { value: 'shoulder', label: '肩' },
  { value: 'knee', label: '膝' },
  { value: 'wrist', label: '腕' },
];

/** 旧伤多选："没有旧伤" 与其他项互斥 */
export function InjuryChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <ChipRow>
      {INJURY_OPTIONS.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value.includes(o.value)}
          onClick={() => {
            const next = toggleMulti(value, o.value, ['none']);
            onChange(next.length === 0 ? ['none'] : next);
          }}
        />
      ))}
    </ChipRow>
  );
}

const LEFTRIGHT_OPTIONS: { value: LeftRightDiff; title: string }[] = [
  { value: 'none', title: '差不多' },
  { value: 'right-stronger', title: '右臂强' },
  { value: 'left-stronger', title: '左臂强' },
];

/** 左右力量差：选强侧后提示弱侧先做 */
export function LeftRightCards({
  value,
  onChange,
}: {
  value: LeftRightDiff;
  onChange: (v: LeftRightDiff) => void;
}): JSX.Element {
  const hint =
    value === 'right-stronger'
      ? '单侧动作会强制你左侧先做，弱的先练。'
      : value === 'left-stronger'
        ? '单侧动作会强制你右侧先做，弱的先练。'
        : null;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {LEFTRIGHT_OPTIONS.map((o) => (
          <SelectCard key={o.value} title={o.title} selected={value === o.value} onClick={() => onChange(o.value)} />
        ))}
      </div>
      {hint ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--warn)', borderLeft: '2px solid var(--warn)', paddingLeft: 10 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const FAT_AREA_OPTIONS: { value: string; label: string }[] = [
  { value: 'belly', label: '肚子' },
  { value: 'thigh', label: '大腿' },
  { value: 'arm', label: '手臂' },
  { value: 'overall', label: '全身都多' },
];

/** 脂肪分布多选："全身都多" 与其他项互斥 */
export function FatAreaChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <ChipRow>
      {FAT_AREA_OPTIONS.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value.includes(o.value)}
          onClick={() => onChange(toggleMulti(value, o.value, ['overall']))}
        />
      ))}
    </ChipRow>
  );
}

const GOAL_OPTIONS: { value: GoalType; title: string; desc: string }[] = [
  { value: 'cut', title: '减脂', desc: '先瘦下来，热量缺口约 300 大卡' },
  { value: 'recomp', title: '塑形（减脂+增肌）', desc: '轻微缺口，瘦的同时把线条练出来' },
  { value: 'bulk', title: '增肌', desc: '多吃一点，热量盈余约 200 大卡' },
];

export function GoalCards({ value, onChange }: { value: GoalType; onChange: (v: GoalType) => void }): JSX.Element {
  return (
    <CardStack>
      {GOAL_OPTIONS.map((o) => (
        <SelectCard key={o.value} title={o.title} desc={o.desc} selected={value === o.value} onClick={() => onChange(o.value)} />
      ))}
    </CardStack>
  );
}

const DIET_HABIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'takeout', label: '外卖为主' },
  { value: 'home-cook', label: '自己做饭' },
  { value: 'sugary-drinks', label: '常喝含糖饮料' },
  { value: 'low-protein', label: '蛋白质吃不够' },
];

/** 每个习惯的口语化点评（选中即显示） */
const DIET_HABIT_COMMENTS: Record<string, string> = {
  takeout: '外卖油盐都重——点单时多加一份白切鸡或鸡腿，汁别拌饭。',
  'home-cook': '自己做饭最好控，炒菜少一勺油，一天能省一百来大卡。',
  'sugary-drinks': '先把含糖饮料换成无糖或水，一个月能少好几千大卡。',
  'low-protein': '蛋白质吃不够练了也白练，每餐先夹肉蛋奶，再扒饭。',
};

export function DietHabitChips({
  value,
  onChange,
  showComments = true,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  showComments?: boolean;
}): JSX.Element {
  return (
    <div>
      <ChipRow>
        {DIET_HABIT_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={value.includes(o.value)}
            onClick={() => onChange(toggleMulti(value, o.value))}
          />
        ))}
      </ChipRow>
      {showComments && value.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.map((h) =>
            DIET_HABIT_COMMENTS[h] ? (
              <p key={h} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>
                · {DIET_HABIT_COMMENTS[h]}
              </p>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

const VENUE_OPTIONS: { value: Venue; title: string; desc: string }[] = [
  { value: 'gym', title: '专业健身房', desc: '器械全，动作选择最多' },
  { value: 'home', title: '居家', desc: '一张瑜伽垫就能开练' },
  { value: 'outdoor', title: '户外', desc: '单杠、双杠、跑道' },
  { value: 'bodyweight', title: '纯自重', desc: '什么器械都不用' },
];

/** 场地多选（至少保留一个由调用方控制）；副标说明自动换动作 */
export function VenueCards({ value, onChange }: { value: Venue[]; onChange: (v: Venue[]) => void }): JSX.Element {
  return (
    <CardStack>
      {VENUE_OPTIONS.map((o) => (
        <SelectCard
          key={o.value}
          title={o.title}
          desc={o.desc}
          selected={value.includes(o.value)}
          onClick={() => {
            const next = value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value];
            onChange(next);
          }}
        />
      ))}
    </CardStack>
  );
}

const SCHEDULE_OPTIONS: { value: ScheduleMode; title: string; desc: string }[] = [
  { value: '1on1off', title: '练一休一', desc: '练一天休一天，最容易坚持' },
  { value: '2on1off', title: '练二休一', desc: '练两天休一天，恢复快的选' },
  { value: 'weekdays', title: '按固定星期', desc: '每周固定几天练，雷打不动' },
];

export function ScheduleModeCards({
  value,
  onChange,
}: {
  value: ScheduleMode;
  onChange: (v: ScheduleMode) => void;
}): JSX.Element {
  return (
    <CardStack>
      {SCHEDULE_OPTIONS.map((o) => (
        <SelectCard key={o.value} title={o.title} desc={o.desc} selected={value === o.value} onClick={() => onChange(o.value)} />
      ))}
    </CardStack>
  );
}

/** 周一~周日 chips（值对齐 Date.getDay()：0=周日 … 6=周六） */
const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];

export function WeekdayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }): JSX.Element {
  return (
    <ChipRow>
      {WEEKDAY_OPTIONS.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value.includes(o.value)}
          onClick={() =>
            onChange(value.includes(o.value) ? value.filter((d) => d !== o.value) : [...value, o.value].sort())
          }
        />
      ))}
    </ChipRow>
  );
}
