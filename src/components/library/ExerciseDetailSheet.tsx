/**
 * 动作详情 BottomSheet：完整六要素（产品红线：没有空壳动作）
 * ① 器械长什么样 ② 在哪找（含区域线稿图）③ 口语步骤 ④ 邪修口诀 ⑤ 组次+建议重量 ⑥ 常见错误
 * 附：听要领（TTS voiceScript）/ 找视频（B站搜索外链）；单侧动作 WarnTag「先做左侧」。
 * 六要素之后是「没有器械？换这些」替代动作区：sheet 内跳转到替代动作详情，可逐级返回。
 */
import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { DangerButton, GhostButton, PrimaryButton } from '@/components/Buttons';
import Icon from '@/components/Icon';
import Tag, { DangerTag, WarnTag } from '@/components/Tag';
import { formatKg } from '@/components/workout/weight';
import { adjustedReps, adjustedWeightKg, repsTarget } from '@/lib/adjust';
import { getCustomExercises, useExerciseOverride } from '@/lib/store';
import { speak } from '@/lib/tts';
import { openExerciseVideo } from '@/lib/video';
import type { Exercise } from '@/lib/types';
import { getExerciseById } from '@/lib/utils-workout';
import { VENUE_LABELS, primaryVenue } from './venues';
import { ZONE_MAP, zoneOfExercise } from './zones';

/** 已配 AI 分解图的动作（public/guides/{id}.jpg，v1.6 首批 10 个） */
const GUIDE_IDS = new Set([
  'lat-pulldown', 'seated-row', 'one-arm-db-row', 'smith-bench-press', 'smith-squat',
  'hack-squat', 'leg-press', 'leg-curl', 'db-shoulder-press', 'assisted-pullup-machine',
]);

function Block({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <section style={{ marginTop: 20 }}>
      <div
        className="font-display font-semibold uppercase text-3"
        style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

export interface ExerciseDetailSheetProps {
  exercise: Exercise | null;
  /** 是否用户自建（显示 自建 Tag + 编辑/删除） */
  isCustom?: boolean;
  onClose: () => void;
  onEdit?: (ex: Exercise) => void;
  onDelete?: (ex: Exercise) => void;
}

export function ExerciseDetailSheet({ exercise, isCustom = false, onClose, onEdit, onDelete }: ExerciseDetailSheetProps): JSX.Element {
  /* sheet 内跳转栈：点替代动作压栈，「返回」出栈；换动作/关闭时清空（A→B→A 正常来回，不死循环） */
  const [stack, setStack] = useState<Exercise[]>([]);
  const rootId = exercise?.id ?? null;
  /* render 期间调整 state（React 官方模式）：根动作变化时清空跳转栈，不走 effect */
  const [prevRootId, setPrevRootId] = useState(rootId);
  if (prevRootId !== rootId) {
    setPrevRootId(rootId);
    setStack([]);
  }

  const ex = stack.length > 0 ? stack[stack.length - 1] : exercise;
  /* RPE 覆盖：有记录时在「练多少」显示「你当前的强度」一行 */
  const [rpeOverride] = useExerciseOverride(ex?.id ?? null);
  const zone = ex ? ZONE_MAP[zoneOfExercise(ex)] : null;
  /* 跳转到的替代动作可能是自建的，自建标记按当前展示的动作重新判定 */
  const exIsCustom = stack.length > 0 ? (ex ? getCustomExercises().some((c) => c.id === ex.id) : false) : isCustom;

  /* 替代链（有序，第一个最优）；解析不到的动作静默跳过 */
  const subs: Exercise[] = [];
  if (ex?.substitutes) {
    for (const id of ex.substitutes) {
      const hit = getExerciseById(id);
      if (hit && hit.id !== ex.id) subs.push(hit);
    }
  }
  const backTo = stack.length > 1 ? stack[stack.length - 2] : exercise;

  /* 你当前的强度：调整后重量 / 次数目标段（"每侧12-14" → "每侧12-14 次"） */
  const strengthKg = ex && rpeOverride ? adjustedWeightKg(ex, rpeOverride) : null;
  const strengthRepsHead = ex && rpeOverride ? repsTarget(adjustedReps(ex, rpeOverride)) : '';
  const strengthReps = /\d$/.test(strengthRepsHead) ? `${strengthRepsHead} 次` : strengthRepsHead;

  return (
    <BottomSheet open={exercise !== null} onClose={onClose} title={ex ? `${zone?.name ?? ''} · 动作详情` : undefined}>
      {ex ? (
        <div style={{ paddingBottom: 8 }}>
          {/* sheet 内跳转返回条 */}
          {stack.length > 0 && backTo ? (
            <button
              type="button"
              onClick={() => setStack((s) => s.slice(0, -1))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                margin: '0 0 8px',
                padding: '4px 0',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon name="arrow-left" size={16} />
              返回「{backTo.name}」
            </button>
          ) : null}

          {/* 头部：动作名 + 肌肉 + Tags */}
          <h2 className="font-display text-1" style={{ margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.25 }}>
            {ex.name}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-2)' }}>主要练：{ex.muscle}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <Tag>
              {ex.sets}组 × {ex.reps}
            </Tag>
            <Tag>器械：{ex.equipment.name}</Tag>
            {ex.unilateral ? <WarnTag>先做左侧</WarnTag> : null}
            {exIsCustom ? <WarnTag>自建</WarnTag> : null}
          </div>

          {/* 分解图（v1.6）：AI 生成 4 格标准动作插画，首批 10 个动作 */}
          {GUIDE_IDS.has(ex.id) ? (
            <div style={{ marginTop: 16 }}>
              <img
                src={`${import.meta.env.BASE_URL}guides/${ex.id}.jpg`}
                alt={`${ex.name}标准动作分解图`}
                loading="lazy"
                style={{ width: '100%', borderRadius: 4, border: '1px solid var(--line)', display: 'block' }}
              />
              <p className="text-3" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
                AI 绘制 · 顺序：左上 → 右上 → 左下 → 右下
              </p>
            </div>
          ) : null}

          {/* ① 长什么样 */}
          <Block label="长什么样">
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: 'var(--text-1)' }}>{ex.equipment.look}</p>
          </Block>

          {/* ② 在哪找（区域线稿图 + 口语位置） */}
          <Block label="在哪找">
            {zone ? (
              <img
                src={zone.svg}
                alt={`${zone.name}线稿图`}
                style={{ width: '100%', aspectRatio: '8 / 5', display: 'block', borderRadius: 4, border: '1px solid var(--line)' }}
              />
            ) : null}
            <p style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--text-1)' }}>{ex.equipment.where}</p>
          </Block>

          {/* ③ 怎么做（口语步骤） */}
          <Block label="怎么做">
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ex.steps.map((step, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, fontSize: 16, lineHeight: 1.65 }}>
                  <span className="num" style={{ flexShrink: 0, width: 22, fontSize: 15, fontWeight: 600, color: 'var(--accent-ink)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: 'var(--text-1)' }}>{step}</span>
                </li>
              ))}
            </ol>
          </Block>

          {/* ④ 邪修口诀 */}
          <Block label="邪修口诀">
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 500,
                lineHeight: 1.6,
                color: 'var(--accent-ink)',
                borderLeft: '2px solid var(--accent)',
                paddingLeft: 12,
              }}
            >
              {ex.mantra}
            </p>
          </Block>

          {/* ⑤ 练多少 */}
          <Block label="练多少">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="num" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)' }}>
                {ex.sets}组 × {ex.reps}
              </span>
              {ex.restSeconds > 0 ? <span style={{ fontSize: 13, color: 'var(--text-2)' }}>组间休 {ex.restSeconds} 秒</span> : null}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>建议重量：{ex.suggestedWeight}</p>
            {rpeOverride ? (
              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--accent-ink)' }}>
                你当前的强度：{strengthKg !== null ? formatKg(strengthKg) : '自重'} / {strengthReps}
              </p>
            ) : null}
            {ex.unilateral ? (
              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--warn)' }}>
                你右臂比左臂壮，单侧动作一律左侧先做，左边做到力竭右边跟着做同样次数。
              </p>
            ) : null}
          </Block>

          {/* ⑥ 别踩坑（常见错误） */}
          <Block label="别踩坑">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ex.commonMistakes.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <DangerTag>常见错误 {i + 1}</DangerTag>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-1)' }}>{m}</p>
                </div>
              ))}
            </div>
          </Block>

          {/* ⑦ 没有器械？换这些（有序替代链，sheet 内跳转） */}
          {subs.length > 0 ? (
            <Block label="没有器械？换这些">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {subs.map((s) => {
                  const venue = primaryVenue(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStack((st) => [...st, s])}
                      aria-label={`查看替代动作${s.name}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        minHeight: 56,
                        padding: '10px 14px',
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--line)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        textAlign: 'left',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="text-1" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
                          {s.name}
                        </span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Tag>{s.muscle}</Tag>
                          {venue ? <Tag>{VENUE_LABELS[venue]}</Tag> : null}
                        </span>
                      </span>
                      <span style={{ color: 'var(--text-3)', display: 'inline-flex', flexShrink: 0 }}>
                        <Icon name="arrow-right" size={18} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Block>
          ) : null}

          {/* 操作：听要领 / 找视频 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            <PrimaryButton icon={<Icon name="tts-on" size={20} />} onClick={() => speak(ex.voiceScript)}>
              听要领
            </PrimaryButton>
            <GhostButton
              icon={<Icon name="play" size={18} />}
              right={<Icon name="arrow-right" size={16} />}
              onClick={() => openExerciseVideo(ex)}
            >
              看视频（直达 B 站 App）
            </GhostButton>
          </div>

          {/* 自建动作：编辑 / 删除 */}
          {exIsCustom ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              {onEdit ? (
                <GhostButton
                  size="sm"
                  icon={
                    /* 共享 Icon 库无铅笔图标，内联 SVG 补齐 */
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      <path d="m15 5 4 4" />
                    </svg>
                  }
                  onClick={() => onEdit(ex)}
                >
                  编辑
                </GhostButton>
              ) : null}
              {onDelete ? (
                <DangerButton size="sm" icon={<Icon name="trash" size={16} />} onClick={() => onDelete(ex)}>
                  删除
                </DangerButton>
              ) : null}
            </div>
          ) : null}

          <p style={{ margin: '16px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
            视频为 B 站搜索外链，感谢各位 up 主；动作以本页要领为准。
          </p>
        </div>
      ) : null}
    </BottomSheet>
  );
}

export default ExerciseDetailSheet;
