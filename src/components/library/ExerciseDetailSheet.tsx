/**
 * 动作详情 BottomSheet：完整六要素（产品红线：没有空壳动作）
 * ① 器械长什么样 ② 在哪找（含区域线稿图）③ 口语步骤 ④ 邪修口诀 ⑤ 组次+建议重量 ⑥ 常见错误
 * 附：听要领（TTS voiceScript）/ 找视频（B站搜索外链）；单侧动作 WarnTag「先做左侧」。
 */
import type { JSX, ReactNode } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { DangerButton, GhostButton, PrimaryButton } from '@/components/Buttons';
import Icon from '@/components/Icon';
import Tag, { DangerTag, WarnTag } from '@/components/Tag';
import { speak } from '@/lib/tts';
import type { Exercise } from '@/lib/types';
import { ZONE_MAP, zoneOfExercise } from './zones';

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
  const ex = exercise;
  const zone = ex ? ZONE_MAP[zoneOfExercise(ex)] : null;
  return (
    <BottomSheet open={ex !== null} onClose={onClose} title={ex ? `${zone?.name ?? ''} · 动作详情` : undefined}>
      {ex ? (
        <div style={{ paddingBottom: 8 }}>
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
            {isCustom ? <WarnTag>自建</WarnTag> : null}
          </div>

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
                  <span className="num" style={{ flexShrink: 0, width: 22, fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>
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
                color: 'var(--accent)',
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

          {/* 操作：听要领 / 找视频 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            <PrimaryButton icon={<Icon name="tts-on" size={20} />} onClick={() => speak(ex.voiceScript)}>
              听要领
            </PrimaryButton>
            <GhostButton
              icon={<Icon name="play" size={18} />}
              right={<Icon name="arrow-right" size={16} />}
              onClick={() =>
                window.open(`https://search.bilibili.com/all?keyword=${encodeURIComponent(ex.videoKeyword)}`, '_blank', 'noopener')
              }
            >
              找视频（B站搜索，外链）
            </GhostButton>
          </div>

          {/* 自建动作：编辑 / 删除 */}
          {isCustom ? (
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
