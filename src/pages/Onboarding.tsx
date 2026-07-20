/**
 * 首次引导问卷（/onboarding）：8 步一屏一问，写完 profile + schedule 进首页。
 * 1 欢迎 → 2 身体档案 → 3 训练底子（经验/旧伤/左右差）→ 4 脂肪与目标
 * → 5 额外加强（体态/髋部/腿/盆底肌，写入 profile.extras，首页小练置顶用）
 * → 6 饮食习惯 → 7 场地 → 8 排期（练一休一/练二休一/按固定星期）
 * 风格遵循 design.md：深色底、SectionLabel 编号 (01)-(08)、accent 大按钮、stagger 入场、
 * 步骤切换 translateX（reduced-motion 降级为淡入淡出）。可返回上一步。
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import Icon from '../components/Icon';
import SectionLabel from '../components/SectionLabel';
import { Stepper } from '../components/library/inputs';
import { vibrate } from '../components/feedback';
import {
  Chip,
  ChipRow,
  DietHabitChips,
  ExperienceCards,
  FatAreaChips,
  GenderCards,
  GoalCards,
  InjuryChips,
  LeftRightCards,
  PickerLabel,
  ScheduleModeCards,
  VenueCards,
  WeekdayChips,
} from '../components/onboarding/selectors';
import { getProfile, getSchedule, updateSettings, useProfile, useSchedule } from '../lib/store';
import { computeTargets } from '../lib/profile';
import { speak } from '../lib/tts';
import type { OnboardingData, ScheduleConfig, UserProfile } from '../lib/types';
import onboardingJson from '../data/onboarding.json';

const data = onboardingJson as OnboardingData;

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

type ProfileDraft = Omit<UserProfile, 'completedAt'>;

/** 问卷默认值（设计文档用户画像：男 / 20岁 / 181cm / 81.5kg） */
const DEFAULT_DRAFT: ProfileDraft = {
  gender: 'male',
  age: 20,
  heightCm: 181,
  weightKg: 81.5,
  experience: 'newbie',
  injuries: ['none'],
  leftRightDiff: 'none',
  fatAreas: [],
  dietHabits: [],
  venues: [],
  goal: 'recomp',
  extras: [],
};

/** 已有档案（设置页重填问卷）→ 回填草稿（extras 老用户可能无此字段，兜底空数组） */
function draftFromProfile(p: UserProfile): ProfileDraft {
  return {
    gender: p.gender,
    age: p.age,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    experience: p.experience,
    injuries: p.injuries,
    leftRightDiff: p.leftRightDiff,
    fatAreas: p.fatAreas,
    dietHabits: p.dietHabits,
    venues: p.venues,
    goal: p.goal,
    extras: p.extras ?? [],
  };
}

const STEP_LABELS = ['欢迎', '身体', '底子', '目标', '加强', '饮食', '场地', '排期'];
const STEP_TITLES = [
  '口袋私教',
  '先认识一下你的身体',
  '你的训练底子',
  '想练成什么样',
  '想额外加强什么',
  '平时怎么吃',
  '你能在哪练',
  '几天练一次',
];

/** 「额外加强」多选：'none' 与其他项互斥 */
function toggleExtras(list: string[], key: string): string[] {
  if (key === 'none') return list.includes('none') ? [] : ['none'];
  const rest = list.filter((k) => k !== 'none');
  return rest.includes(key) ? rest.filter((k) => k !== key) : [...rest, key];
}

export default function Onboarding(): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [, setProfile] = useProfile();
  const [, setSchedule] = useSchedule();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState<ProfileDraft>(() => {
    const existing = getProfile();
    return existing ? draftFromProfile(existing) : DEFAULT_DRAFT;
  });
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleConfig>(() => getSchedule());

  const patch = (p: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...p }));

  const canNext =
    step === 6
      ? draft.venues.length > 0
      : step === 7
        ? scheduleDraft.mode !== 'weekdays' || scheduleDraft.weekdays.length > 0
        : true;

  const go = (next: number) => {
    vibrate(15);
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const finish = () => {
    const profile: UserProfile = { ...draft, completedAt: Date.now() };
    setProfile(profile);
    setSchedule(scheduleDraft);
    // 同步旧字段：summary 消耗估算、老身体卡仍读 settings.weightKg
    updateSettings({ weightKg: draft.weightKg });
    vibrate(30);
    speak('计划生成好了，跟着练就行');
    navigate('/', { replace: true });
  };

  const targets = computeTargets({ ...draft, completedAt: 0 });

  const itemV = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.1 } } }
    : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } } };

  const blocks: JSX.Element[] = [
    /* ---------- (01) 欢迎 ---------- */
    <>
      <motion.div variants={itemV}>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: 'var(--text-1)' }}>{data.welcome}</p>
      </motion.div>
      <motion.div
        variants={itemV}
        style={{
          marginTop: 16,
          padding: '12px 14px',
          borderLeft: '2px solid var(--warn)',
          background: 'var(--bg-raised)',
          borderRadius: 4,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>{data.disclaimer}</p>
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        接下来 7 个问题都是给计划定参数的：你填的每一项，都会变成课表、重量和热量里的数字。
      </motion.p>
    </>,
    /* ---------- (02) 身体档案 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>性别</PickerLabel>
        <GenderCards value={draft.gender} onChange={(gender) => patch({ gender })} />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 20 }}>
        <Stepper label="年龄" value={draft.age} onChange={(age) => patch({ age })} min={12} max={80} unit="岁" />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 16 }}>
        <Stepper label="身高" value={draft.heightCm} onChange={(heightCm) => patch({ heightCm })} min={130} max={220} unit="cm" />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 16 }}>
        <Stepper
          label="体重"
          value={draft.weightKg}
          onChange={(weightKg) => patch({ weightKg })}
          min={35}
          max={200}
          step={0.5}
          decimals={1}
          unit="kg"
        />
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        为什么问这个：性别和体重用来算你每天该吃多少、每个动作从多重开始举——推荐重量就是按这个分档的。
      </motion.p>
    </>,
    /* ---------- (03) 训练底子 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>训练经验</PickerLabel>
        <ExperienceCards value={draft.experience} onChange={(experience) => patch({ experience })} />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 20 }}>
        <PickerLabel>旧伤（多选，有就直说）</PickerLabel>
        <InjuryChips value={draft.injuries} onChange={(injuries) => patch({ injuries })} />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 20 }}>
        <PickerLabel>左右力量差</PickerLabel>
        <LeftRightCards value={draft.leftRightDiff} onChange={(leftRightDiff) => patch({ leftRightDiff })} />
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        为什么问这个：练没练过决定起步难度，旧伤帮你绕开危险动作，左右差决定单侧动作先练哪边。
      </motion.p>
    </>,
    /* ---------- (04) 脂肪与目标 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>脂肪主要堆在哪（多选）</PickerLabel>
        <FatAreaChips value={draft.fatAreas} onChange={(fatAreas) => patch({ fatAreas })} />
      </motion.div>
      <motion.div variants={itemV} style={{ marginTop: 20 }}>
        <PickerLabel>你的目标（三选一）</PickerLabel>
        <GoalCards value={draft.goal} onChange={(goal) => patch({ goal })} />
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        为什么问这个：目标决定每天热量是加还是减、重量往上顶还是稳一稳；脂肪位置只给你自己前后对比用，谁都不给看。
      </motion.p>
    </>,
    /* ---------- (05) 额外加强（日常小练置顶用） ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>想额外加强什么（多选，选不出来就"都不要"）</PickerLabel>
        <ChipRow>
          {[
            { value: 'posture', label: '体态矫正' },
            { value: 'hip', label: '髋部灵活' },
            { value: 'legs', label: '腿部强化' },
            { value: 'pelvic', label: draft.gender === 'female' ? '盆底肌（产后先问医生）' : '盆底肌（男性健康）' },
            { value: 'none', label: '都不要' },
          ].map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={(draft.extras ?? []).includes(o.value)}
              onClick={() => patch({ extras: toggleExtras(draft.extras ?? [], o.value) })}
            />
          ))}
        </ChipRow>
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        {data.extrasWhy ?? '为什么问这个：选了你关心的小练就置顶到首页，碎片时间随手练。'}
      </motion.p>
    </>,
    /* ---------- (06) 饮食习惯 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>饮食习惯（多选，选中给你一句实话）</PickerLabel>
        <DietHabitChips value={draft.dietHabits} onChange={(dietHabits) => patch({ dietHabits })} />
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5 }}>
        为什么问这个：照你真实的吃饭习惯给能执行的建议，而不是一份坚持不下来的食谱。都不用精确称克，记个大概就行，饮食页会帮你估。
      </motion.p>
    </>,
    /* ---------- (07) 场地 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>你能在哪练（多选，至少一个）</PickerLabel>
        <VenueCards value={draft.venues} onChange={(venues) => patch({ venues })} />
      </motion.div>
      <motion.p variants={itemV} className="text-2" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        为什么问这个：计划会按你的场地自动换动作——选了健身房就排器械版，只有瑜伽垫就排居家版，不用你自己换算。
      </motion.p>
      {draft.venues.length === 0 ? (
        <motion.p variants={itemV} style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--warn)' }}>
          至少选一个场地，实在不行选「纯自重」。
        </motion.p>
      ) : null}
    </>,
    /* ---------- (08) 排期 ---------- */
    <>
      <motion.div variants={itemV}>
        <PickerLabel>排期（三选一）</PickerLabel>
        <ScheduleModeCards
          value={scheduleDraft.mode}
          onChange={(mode) => setScheduleDraft((s) => ({ ...s, mode }))}
        />
      </motion.div>
      <motion.p variants={itemV} className="text-3" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6 }}>
        为什么问这个：课表跟着你的节奏走，而不是你去迁就课表——选那个你能坚持三个月的。
      </motion.p>
      <AnimatePresence initial={false}>
        {scheduleDraft.mode === 'weekdays' ? (
          <motion.div
            key="weekdays"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.25, ease: 'easeOut' }}
            style={{ marginTop: 16 }}
          >
            <PickerLabel>哪几天练（多选）</PickerLabel>
            <WeekdayChips
              value={scheduleDraft.weekdays}
              onChange={(weekdays) => setScheduleDraft((s) => ({ ...s, weekdays }))}
            />
            {scheduleDraft.weekdays.length === 0 ? (
              <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--warn)' }}>至少挑一天。</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.div
        variants={itemV}
        style={{ marginTop: 20, padding: '14px 16px', background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 4 }}
      >
        <PickerLabel>按你的档案，每天大概这么吃</PickerLabel>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--text-1)' }}>
          热量约 <span className="num" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{targets.targetKcal}</span> 大卡
          · 蛋白约 <span className="num" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{targets.proteinG}</span> g
        </p>
        <p className="text-2" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6 }}>
          脂肪约 {targets.fatG} g · 碳水约 {targets.carbsG} g。改身体数据随时自动重算。
        </p>
      </motion.div>
    </>,
  ];

  return (
    <div style={{ paddingTop: 20, paddingBottom: 8 }}>
      <SectionLabel index={String(step + 1).padStart(2, '0')}>{STEP_LABELS[step]}</SectionLabel>
      <h1
        className="font-display text-1"
        style={{ margin: '10px 0 20px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}
      >
        {STEP_TITLES[step]}
      </h1>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 36 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -36 * dir }}
          transition={reduce ? { duration: 0.1 } : { duration: 0.25, ease: 'easeOut' }}
        >
          <motion.div variants={{ show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show">
            {blocks[step]}
          </motion.div>

          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PrimaryButton size="lg" onClick={() => (step === 7 ? finish() : go(step + 1))} disabled={!canNext}>
              {step === 7 ? '开始我的计划' : '下一步'}
            </PrimaryButton>
            {step > 0 ? (
              <GhostButton icon={<Icon name="arrow-left" size={18} />} onClick={() => go(step - 1)}>
                上一步
              </GhostButton>
            ) : null}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
