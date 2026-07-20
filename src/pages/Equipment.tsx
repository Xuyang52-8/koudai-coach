/**
 * 我的器械页（/equipment）：勾出健身房实际有的器械，排课按清单精确适配。
 * - 顶部返回（页面自带，入口由设置页接）
 * - 预设快捷按钮：全套商健（全选）/ 我的健身房模板（preset-xu-gym）/ 宿舍简易（哑铃+凳）
 * - 分组勾选列表：大 checkbox（32px）+ 整行 ≥64px 热区，汗手友好；颜色全走 CSS 变量，黑白主题都成立
 * - 底部 BigActionButton 保存：写进 profile.ownedEquipment；全选时存 undefined（= 全都有，老用户语义）
 *   保存后 toast「已保存，下节课起生效」
 * 未建档（profile=null）：列表可看可勾，保存禁用并提示先完成问卷。
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import BigActionButton from '../components/workout/BigActionButton';
import { ALL_EQUIPMENT_IDS, EQUIPMENT_GROUPS, EQUIPMENT_PRESETS } from '../lib/equipment';
import { useProfile } from '../lib/store';

const TOTAL = ALL_EQUIPMENT_IDS.length;

/** 两个勾选集合是否一致（预设按钮高连用） */
function sameSelection(a: Set<string>, ids: string[]): boolean {
  return a.size === ids.length && ids.every((id) => a.has(id));
}

export default function Equipment(): JSX.Element {
  const navigate = useNavigate();
  const [profile, setProfile] = useProfile();
  const { toast, host } = useFeedback();

  // 勾选态：档案存过按档案来；没存过（undefined = 全都有）默认全勾
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(profile?.ownedEquipment ?? ALL_EQUIPMENT_IDS),
  );

  const toggle = (id: string): void => {
    vibrate(15);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyPreset = (ids: string[]): void => {
    vibrate(15);
    setSelected(new Set(ids));
  };

  const goBack = (): void => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/settings');
  };

  const save = (): void => {
    if (!profile) return;
    // 全勾 = 全都有：存 undefined，保持"没设置过"的老语义，解析引擎零过滤
    const owned = selected.size >= TOTAL ? undefined : ALL_EQUIPMENT_IDS.filter((id) => selected.has(id));
    setProfile({ ...profile, ownedEquipment: owned });
    vibrate(30);
    toast('已保存，下节课起生效');
  };

  return (
    <div style={{ paddingBottom: 32 }}>
      {host}

      {/* 顶部返回（页面自带；入口由设置页统一接） */}
      <div style={{ paddingTop: 12 }}>
        <button
          type="button"
          aria-label="返回"
          onClick={goBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            minHeight: 44,
            padding: '0 8px 0 0',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-2)',
            fontSize: 14,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Icon name="arrow-left" size={18} />
          返回
        </button>
      </div>

      <ScreenHeader label="我的器械 · MY EQUIPMENT" title="你健身房有啥" />

      <p className="text-2" style={{ margin: '0 0 4px', fontSize: 14, lineHeight: 1.7 }}>
        勾出你健身房实际有的器械。排课时缺器械的动作自动换成替代动作——你练的每一个动作，器械都摸得着。
      </p>

      {/* 预设快捷模板 */}
      <section style={{ marginTop: 20 }}>
        <SectionLabel index="预设">快捷模板</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }} role="group" aria-label="快捷模板">
          {EQUIPMENT_PRESETS.map((preset) => {
            const active = sameSelection(selected, preset.equipmentIds);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset.equipmentIds)}
                style={{
                  minHeight: 48,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--text-2)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'border-color 150ms, color 150ms, background 150ms',
                }}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
        <div className="text-3" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
          {EQUIPMENT_PRESETS.find((p) => sameSelection(selected, p.equipmentIds))?.blurb ??
            '模板只是起点，照着健身房现场加减就行'}
        </div>
      </section>

      {/* 分组勾选列表 */}
      {EQUIPMENT_GROUPS.map((group, gi) => (
        <section key={group.id} style={{ marginTop: 24 }}>
          <SectionLabel index={String(gi + 1).padStart(2, '0')}>{group.name}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {group.items.map((item) => {
              const checked = selected.has(item.id);
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => toggle(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 64,
                    padding: '10px 12px',
                    background: checked ? 'var(--accent-dim)' : 'var(--bg-raised)',
                    border: checked ? '1px solid var(--accent)' : '1px solid var(--line)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'border-color 150ms, background 150ms',
                  }}
                >
                  {/* 大 checkbox：32px 盒子 + 打勾，汗手也能一把点中 */}
                  <span
                    aria-hidden
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: checked ? 'var(--accent)' : 'transparent',
                      border: checked ? 'none' : '2px solid var(--line-strong)',
                      color: 'var(--on-accent)',
                      transition: 'background 150ms, border-color 150ms',
                    }}
                  >
                    {checked ? <Icon name="check" size={20} strokeWidth={3} /> : null}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span className="text-1" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
                      {item.name}
                    </span>
                    <span className="text-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {item.hint}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>
      ))}

      {/* 统计 + 保存 */}
      <div
        className="text-2"
        style={{ marginTop: 24, fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}
      >
        已选 <span className="num text-1" style={{ fontWeight: 700 }}>{selected.size}</span> / {TOTAL} 件
        · 没勾的器械，排课自动换替代动作
      </div>

      {profile ? null : (
        <div
          className="text-2"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.6,
            textAlign: 'center',
            background: 'var(--warn-dim)',
            color: 'var(--warn)',
            borderRadius: 4,
          }}
        >
          还没建档：先完成首页问卷，器械清单才能写进你的档案
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
        <BigActionButton
          label="保存器械清单"
          sideHint={profile ? '保存后下节课起生效' : '先完成问卷再设置器械'}
          disabled={!profile}
          onPress={save}
        />
      </div>
    </div>
  );
}
