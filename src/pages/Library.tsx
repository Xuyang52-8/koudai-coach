/**
 * 动作库页（/library）
 * 实现规格：/mnt/agents/output/design/library.md
 * - ScreenHeader：label「动作库 · EXERCISE LIBRARY」+ display「不认识就查」+ 右侧「+ 自建」
 * - §1 搜索框（名称/肌肉/器械模糊过滤，150ms debounce；无结果引导自建并预填搜索词）
 * - §2 器械区域分类 2×3 网格（6 张线稿图 + 口语定位 + 动作数）
 * - §3 区域动作列表（返回路径 + 行列表 → BottomSheet 六要素详情）
 * - §4 我的自建动作（4 屏步骤式表单，六要素缺一禁止保存；可编辑/删除）
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { DangerButton, GhostButton } from '@/components/Buttons';
import EmptyState from '@/components/EmptyState';
import { useFeedback } from '@/components/feedback';
import Icon from '@/components/Icon';
import ScreenHeader from '@/components/ScreenHeader';
import SectionLabel from '@/components/SectionLabel';
import TTSToggle from '@/components/TTSToggle';
import CustomExerciseForm from '@/components/library/CustomExerciseForm';
import ExerciseDetailSheet from '@/components/library/ExerciseDetailSheet';
import ExerciseRow from '@/components/library/ExerciseRow';
import { ZONES, zoneOfExercise } from '@/components/library/zones';
import type { ZoneId } from '@/components/library/zones';
import { removeCustomExercise, useCustomExercises } from '@/lib/store';
import type { Exercise } from '@/lib/types';
import { getAllExercises } from '@/lib/utils-workout';

/* ================= 区域分类格 ================= */

function ZoneCard({
  zone,
  count,
  delay,
  onClick,
}: {
  zone: (typeof ZONES)[number];
  count: number;
  delay: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 24, mass: 0.9 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      aria-label={`${zone.name}，${count} 个动作`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 108,
        padding: '10px 12px',
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img
        src={zone.svg}
        alt=""
        style={{ width: 64, aspectRatio: '8 / 5', flexShrink: 0, display: 'block', borderRadius: 2, border: '1px solid var(--line)' }}
      />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="text-1" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
          {zone.name}
        </span>
        <span
          className="text-2"
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {zone.caption}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>{count}</span>
          <span className="text-3" style={{ fontSize: 11 }}>
            个动作
          </span>
        </span>
      </span>
    </motion.button>
  );
}

/* ================= 主页面 ================= */

export default function Library(): JSX.Element {
  const [customExercises] = useCustomExercises();
  const { celebrate, toast, host } = useFeedback();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeZone, setActiveZone] = useState<ZoneId | null>(null);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [prefillName, setPrefillName] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);

  // 150ms debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // 数据量小（27 内置 + 自建），每次渲染直接计算，省掉 memo 依赖管理
  const allExercises = getAllExercises();
  const customIds = new Set(customExercises.map((e) => e.id));

  const zoneCounts: Record<ZoneId, number> = { cardio: 0, dumbbell: 0, barbell: 0, machine: 0, cable: 0, bodyweight: 0 };
  for (const ex of allExercises) zoneCounts[zoneOfExercise(ex)] += 1;

  const searching = debouncedQuery.length > 0;
  const q = debouncedQuery.toLowerCase();
  const searchResults = searching
    ? allExercises.filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          ex.muscle.toLowerCase().includes(q) ||
          ex.equipment.name.toLowerCase().includes(q),
      )
    : [];

  const zoneExercises = activeZone ? allExercises.filter((ex) => zoneOfExercise(ex) === activeZone) : [];
  const activeZoneDef = activeZone ? ZONES.find((z) => z.id === activeZone) : null;

  const openCreate = (prefill?: string) => {
    setEditing(null);
    setPrefillName(prefill);
    setFormOpen(true);
  };

  const handleSaved = (_ex: Exercise, isEdit: boolean) => {
    celebrate(isEdit ? '改好了，已存回动作库' : '存好了，动作库里能找到');
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    removeCustomExercise(deleteTarget.id);
    setDeleteTarget(null);
    setDetail(null);
    toast('删了，想录随时再录');
  };

  return (
    <div>
      {host}
      <ScreenHeader
        label="动作库 · EXERCISE LIBRARY"
        title="不认识就查"
        actions={
          <>
            <GhostButton
              size="sm"
              fullWidth={false}
              icon={<Icon name="plus" size={18} />}
              onClick={() => openCreate()}
              style={{ minHeight: 48, padding: '0 14px' }}
            >
              自建
            </GhostButton>
            <TTSToggle />
          </>
        }
      />

      {/* §1 搜索框 */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', display: 'inline-flex' }}>
          {/* 共享 Icon 库无放大镜图标，内联 SVG 补齐（24×24 · 2px 描边 · currentColor） */}
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜动作或器械：深蹲 / 那个拉背的架子…"
          aria-label="搜索动作"
          style={{
            width: '100%',
            height: 56,
            background: 'var(--bg-inset)',
            border: '1px solid var(--line-strong)',
            borderRadius: 4,
            padding: '0 14px 0 42px',
            fontSize: 16,
            color: 'var(--text-1)',
            fontFamily: 'var(--font-body)',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {searching ? (
          /* ===== 搜索态：直接出结果 ===== */
          <motion.section
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: 20 }}
          >
            <p className="text-2" style={{ margin: '0 0 12px', fontSize: 13 }}>
              「{debouncedQuery}」搜到 {searchResults.length} 个
            </p>
            {searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {searchResults.map((ex, i) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    isCustom={customIds.has(ex.id)}
                    delay={Math.min(i * 0.04, 0.3)}
                    onClick={setDetail}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                text={`库里没有「${debouncedQuery}」。要不自己建一个？`}
                actionLabel="+ 自建"
                onAction={() => openCreate(debouncedQuery)}
              />
            )}
          </motion.section>
        ) : activeZone && activeZoneDef ? (
          /* ===== §3 区域动作列表 ===== */
          <motion.section
            key={`zone-${activeZone}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: 20 }}
          >
            <motion.button
              type="button"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setActiveZone(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                padding: '8px 0',
                minHeight: 44,
                cursor: 'pointer',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '0.06em',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon name="arrow-left" size={16} />
              <span className="font-display uppercase" style={{ letterSpacing: '0.14em' }}>
                动作库 / <span style={{ color: 'var(--text-1)' }}>{activeZoneDef.name}</span>
              </span>
            </motion.button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 14px' }}>
              <img
                src={activeZoneDef.svg}
                alt={`${activeZoneDef.name}线稿图`}
                style={{ width: 96, aspectRatio: '8 / 5', display: 'block', borderRadius: 4, border: '1px solid var(--line)' }}
              />
              <div>
                <div className="text-1" style={{ fontSize: 20, fontWeight: 600 }}>
                  {activeZoneDef.name}
                </div>
                <div className="text-2" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                  {zoneExercises.length} 个动作 · 每个都有完整教程，没有空壳
                </div>
              </div>
            </div>
            {zoneExercises.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zoneExercises.map((ex, i) => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    isCustom={customIds.has(ex.id)}
                    delay={Math.min(i * 0.04, 0.36)}
                    onClick={setDetail}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                text="这个区还没录动作。你健身房有这玩意？录一个。"
                actionLabel="+ 自建"
                onAction={() => openCreate()}
              />
            )}
          </motion.section>
        ) : (
          /* ===== 默认态：§2 区域网格 + §4 自建 ===== */
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <section style={{ marginTop: 24 }}>
              <SectionLabel index="区域">按器械区域找</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                {ZONES.map((z, i) => (
                  <ZoneCard key={z.id} zone={z} count={zoneCounts[z.id]} delay={i * 0.05} onClick={() => setActiveZone(z.id)} />
                ))}
              </div>
            </section>

            <section style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <SectionLabel index="自建">你录的动作</SectionLabel>
                <span className="text-3" style={{ fontSize: 13 }}>
                  {customExercises.length} 个
                </span>
              </div>
              <div style={{ marginTop: 14 }}>
                {customExercises.length === 0 ? (
                  <EmptyState
                    text="私教教了新动作？记下来，下节课就能排进计划。"
                    actionLabel="+ 自建动作"
                    onAction={() => openCreate()}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {customExercises.map((ex, i) => (
                      <ExerciseRow
                        key={ex.id}
                        exercise={ex}
                        isCustom
                        delay={Math.min(i * 0.04, 0.3)}
                        onClick={setDetail}
                      />
                    ))}
                    <GhostButton icon={<Icon name="plus" size={18} />} onClick={() => openCreate()}>
                      再录一个
                    </GhostButton>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 动作详情（六要素） */}
      <ExerciseDetailSheet
        exercise={detail}
        isCustom={detail ? customIds.has(detail.id) : false}
        onClose={() => setDetail(null)}
        onEdit={(ex) => {
          setDetail(null);
          setEditing(ex);
          setPrefillName(undefined);
          setFormOpen(true);
        }}
        onDelete={(ex) => setDeleteTarget(ex)}
      />

      {/* 自建 / 编辑表单 */}
      <CustomExerciseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        prefillName={prefillName}
        onSaved={handleSaved}
      />

      {/* 删除二次确认 */}
      <BottomSheet open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="删除确认">
        {deleteTarget ? (
          <div>
            <h3 className="text-1" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              删掉「{deleteTarget.name}」？
            </h3>
            <p className="text-2" style={{ margin: '10px 0 20px', fontSize: 15, lineHeight: 1.6 }}>
              这是你录的自建动作，删了就没了，课表里的引用也会失效。确定要删？
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DangerButton icon={<Icon name="trash" size={18} />} onClick={handleDeleteConfirm}>
                确认删除
              </DangerButton>
              <GhostButton onClick={() => setDeleteTarget(null)}>先留着</GhostButton>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
