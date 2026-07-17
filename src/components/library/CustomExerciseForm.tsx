/**
 * 自建动作表单（BottomSheet 4 屏步骤式，顶部 3px 步骤进度条）
 * ① 叫什么/练哪/在哪个区 ② 器械名+长什么样+在哪找 ③ 步骤+口诀 ④ 组次+建议重量+常见错误
 * 质量门（产品红线，不要空壳动作库）：六要素任一为空禁止保存——
 * 保存按钮 disabled，并明确提示缺哪几项。
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { useFeedback } from '@/components/feedback';
import Icon from '@/components/Icon';
import { generateExerciseDraft } from '@/lib/ai-exercise';
import { addCustomExercise, removeCustomExercise, useSettings } from '@/lib/store';
import type { Exercise, Venue } from '@/lib/types';
import { Field, FieldArea, RowToggle, Stepper } from './inputs';
import { VENUE_OPTIONS } from './venues';
import { ZONES, encodeCustomCategory, zoneOfExercise } from './zones';
import type { ZoneId } from './zones';

const STEP_TITLES = ['叫什么 · 练哪 · 在哪个区', '器械长啥样 · 在哪找', '怎么做 · 口诀', '练多少 · 别踩坑'];

interface FormState {
  name: string;
  muscle: string;
  zone: ZoneId | null;
  /** 能做的场地（多选，至少一个） */
  venues: Venue[];
  equipName: string;
  equipLook: string;
  equipWhere: string;
  steps: string[];
  mantra: string;
  sets: number;
  reps: string;
  suggestedWeight: string;
  restSeconds: number;
  unilateral: boolean;
  mistakes: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  muscle: '',
  zone: null,
  venues: [],
  equipName: '',
  equipLook: '',
  equipWhere: '',
  steps: ['', '', ''],
  mantra: '',
  sets: 3,
  reps: '',
  suggestedWeight: '',
  restSeconds: 60,
  unilateral: false,
  mistakes: ['', ''],
};

function initFrom(editing: Exercise | null | undefined, prefillName: string | undefined): FormState {
  if (editing) {
    return {
      name: editing.name,
      muscle: editing.muscle,
      zone: zoneOfExercise(editing),
      venues: editing.venues ? [...editing.venues] : [],
      equipName: editing.equipment.name,
      equipLook: editing.equipment.look,
      equipWhere: editing.equipment.where,
      steps: [...editing.steps, ''].slice(0, Math.max(3, editing.steps.length)),
      mantra: editing.mantra,
      sets: editing.sets,
      reps: editing.reps,
      suggestedWeight: editing.suggestedWeight,
      restSeconds: editing.restSeconds > 0 ? editing.restSeconds : 60,
      unilateral: editing.unilateral,
      mistakes: [...editing.commonMistakes, ''].slice(0, Math.max(2, editing.commonMistakes.length)),
    };
  }
  return { ...EMPTY_FORM, name: prefillName ?? '' };
}

/** 质量门：返回缺失项中文标签列表，空数组 = 可保存 */
function missingFields(s: FormState): string[] {
  const missing: string[] = [];
  if (!s.name.trim()) missing.push('动作名称');
  if (!s.muscle.trim()) missing.push('目标肌肉');
  if (!s.zone) missing.push('区域分类');
  if (s.venues.length === 0) missing.push('能做的场地');
  if (!s.equipName.trim()) missing.push('器械名称');
  if (!s.equipLook.trim()) missing.push('器械长什么样');
  if (!s.equipWhere.trim()) missing.push('在哪找');
  if (!s.steps.some((t) => t.trim())) missing.push('步骤（至少 1 条）');
  if (!s.mantra.trim()) missing.push('邪修口诀');
  if (s.sets < 1) missing.push('组数');
  if (!s.reps.trim()) missing.push('次数');
  if (!s.suggestedWeight.trim()) missing.push('建议重量');
  if (!s.mistakes.some((t) => t.trim())) missing.push('常见错误（至少 1 条）');
  return missing;
}

export interface CustomExerciseFormProps {
  open: boolean;
  onClose: () => void;
  /** 编辑已有自建动作（null/undefined = 新建） */
  editing?: Exercise | null;
  /** 搜索无结果时预填的动作名 */
  prefillName?: string;
  onSaved: (ex: Exercise, isEdit: boolean) => void;
}

/**
 * 外层壳：BottomSheet 关闭时 children 整体卸载，
 * 因此内层 FormSteps 每次打开都重新挂载、按 editing/prefillName 初始化，无需 reset effect。
 */
export function CustomExerciseForm({ open, onClose, editing, prefillName, onSaved }: CustomExerciseFormProps): JSX.Element {
  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? '编辑动作' : '自建动作'}>
      <FormSteps editing={editing} prefillName={prefillName} onSaved={onSaved} onClose={onClose} />
    </BottomSheet>
  );
}

function FormSteps({ editing, prefillName, onSaved, onClose }: Omit<CustomExerciseFormProps, 'open'>): JSX.Element {
  const [settings] = useSettings();
  const { toast, host } = useFeedback();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initFrom(editing, prefillName));
  const [aiLoading, setAiLoading] = useState(false);
  /** AI 给了就带上的隐藏字段（voiceScript / videoKeyword / kcalPerSet），用户看不到也不用改 */
  const [aiExtra, setAiExtra] = useState<{ voiceScript?: string; videoKeyword?: string; kcalPerSet?: number }>({});

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const missing = useMemo(() => missingFields(form), [form]);
  const isEdit = Boolean(editing);
  const hasKey = settings.deepseekKey.trim().length > 0;

  const toggleVenue = (v: Venue) =>
    setForm((f) => ({ ...f, venues: f.venues.includes(v) ? f.venues.filter((x) => x !== v) : [...f.venues, v] }));

  /** AI 帮我填：按动作名生成草稿，预填进各步字段（用户可改），质量门不变 */
  const handleAiFill = async () => {
    const name = form.name.trim();
    if (!name) {
      toast('先写个动作名，AI 才知道填啥');
      return;
    }
    const key = settings.deepseekKey.trim();
    if (!key || aiLoading) return;
    setAiLoading(true);
    try {
      const draft = await generateExerciseDraft(name, key);
      setForm((f) => ({
        ...f,
        muscle: draft.muscle ?? f.muscle,
        equipName: draft.equipment?.name || f.equipName,
        equipLook: draft.equipment?.look || f.equipLook,
        equipWhere: draft.equipment?.where || f.equipWhere,
        steps: draft.steps && draft.steps.length > 0 ? [...draft.steps] : f.steps,
        mantra: draft.mantra ?? f.mantra,
        sets: draft.sets ?? f.sets,
        reps: draft.reps ?? f.reps,
        suggestedWeight: draft.suggestedWeight ?? f.suggestedWeight,
        restSeconds: draft.restSeconds ?? f.restSeconds,
        unilateral: draft.unilateral ?? f.unilateral,
        mistakes: draft.commonMistakes && draft.commonMistakes.length > 0 ? [...draft.commonMistakes] : f.mistakes,
        venues: draft.venues && draft.venues.length > 0 ? [...draft.venues] : f.venues,
      }));
      setAiExtra({
        voiceScript: draft.voiceScript?.trim() || undefined,
        videoKeyword: draft.videoKeyword?.trim() || undefined,
        kcalPerSet: draft.kcalPerSet,
      });
      toast('填好了，往后翻着检查一遍，不对就改');
    } catch {
      toast('AI 没听懂，手动填吧');
    } finally {
      setAiLoading(false);
    }
  };

  const setListItem = (key: 'steps' | 'mistakes', i: number, v: string) =>
    setForm((f) => {
      const arr = [...f[key]];
      arr[i] = v;
      return { ...f, [key]: arr };
    });
  const addListItem = (key: 'steps' | 'mistakes', max: number) =>
    setForm((f) => (f[key].length >= max ? f : { ...f, [key]: [...f[key], ''] }));
  const removeListItem = (key: 'steps' | 'mistakes', i: number) =>
    setForm((f) => (f[key].length <= 1 ? f : { ...f, [key]: f[key].filter((_, j) => j !== i) }));

  const handleSave = () => {
    if (missing.length > 0 || !form.zone) return;
    const steps = form.steps.map((t) => t.trim()).filter(Boolean);
    const mistakes = form.mistakes.map((t) => t.trim()).filter(Boolean);
    /** voiceScript / videoKeyword：AI 给了就用，没给按现有自动合成逻辑 */
    const autoVoiceScript = [
      `${form.name.trim()}。`,
      `器械是${form.equipName.trim()}，${form.equipLook.trim()}。`,
      `在哪找：${form.equipWhere.trim()}。`,
      `怎么做：${steps.map((t, i) => `第${i + 1}步，${t}`).join('。')}。`,
      `记住口诀：${form.mantra.trim()}。`,
      form.unilateral ? '单侧动作，先做左侧。' : '',
    ].join('');
    const payload: Omit<Exercise, 'id'> & { id?: string } = {
      ...(editing?.id ? { id: editing.id } : {}),
      name: form.name.trim(),
      muscle: form.muscle.trim(),
      category: encodeCustomCategory(form.zone),
      venues: [...form.venues],
      equipment: {
        name: form.equipName.trim(),
        look: form.equipLook.trim(),
        where: form.equipWhere.trim(),
      },
      steps,
      mantra: form.mantra.trim(),
      sets: form.sets,
      reps: form.reps.trim(),
      suggestedWeight: form.suggestedWeight.trim(),
      commonMistakes: mistakes,
      unilateral: form.unilateral,
      restSeconds: form.restSeconds,
      videoKeyword: aiExtra.videoKeyword ?? `${form.name.trim()} 动作 教学`,
      voiceScript: aiExtra.voiceScript ?? autoVoiceScript,
      kcalPerSet: aiExtra.kcalPerSet ?? 30, // 自建动作按中等强度粗估每组约 30 大卡
    };
    if (editing?.id) removeCustomExercise(editing.id); // 原地更新：先删后按原 id 加回
    const saved = addCustomExercise(payload);
    onSaved(saved, isEdit);
    onClose();
  };

  const listEditor = (key: 'steps' | 'mistakes', max: number, placeholder: (i: number) => string, addLabel: string): JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {form[key].map((v, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num" style={{ flexShrink: 0, width: 20, fontSize: 14, fontWeight: 600, color: 'var(--text-3)' }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div style={{ flex: 1 }}>
            <Field value={v} onChange={(nv) => setListItem(key, i, nv)} placeholder={placeholder(i)} />
          </div>
          {form[key].length > 1 ? (
            <button
              type="button"
              aria-label="删除这行"
              onClick={() => removeListItem(key, i)}
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-3)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          ) : null}
        </div>
      ))}
      {form[key].length < max ? (
        <GhostButton size="sm" fullWidth={false} icon={<Icon name="plus" size={16} />} onClick={() => addListItem(key, max)}>
          {addLabel}
        </GhostButton>
      ) : null}
    </div>
  );

  return (
    <div>
      {host}
      {/* 3px 步骤进度条 */}
      <div style={{ height: 3, background: 'var(--bg-inset)', borderRadius: 999, overflow: 'hidden', margin: '2px 0 16px' }}>
        <motion.div
          animate={{ width: `${((step + 1) / 4) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ height: '100%', background: 'var(--accent)' }}
        />
      </div>

      <div
        className="font-display font-semibold uppercase"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, letterSpacing: '0.14em', marginBottom: 14 }}
      >
        <span>
          <span className="text-3">({String(step + 1).padStart(2, '0')})</span>
          <span className="text-1" style={{ marginLeft: 8 }}>
            {STEP_TITLES[step]}
          </span>
        </span>
        <span className="text-3 num">{step + 1} / 4</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {step === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="动作名称" value={form.name} onChange={(v) => patch({ name: v })} placeholder="如：坐姿器械推胸" />
              <Field label="目标肌肉" value={form.muscle} onChange={(v) => patch({ muscle: v })} placeholder="如：胸大肌、三角肌前束" />
              {/* AI 帮我填：按动作名生成草稿预填各步，质量门不变（六要素缺一仍禁止保存） */}
              <div>
                <PrimaryButton disabled={!hasKey || aiLoading} onClick={handleAiFill}>
                  {aiLoading ? 'AI 填写中…' : 'AI 帮我填'}
                </PrimaryButton>
                <p className="text-2" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  {hasKey ? '按动作名把后面几步都填好，填完随便改。' : '先到「我的」页填 DeepSeek Key，才能用 AI 帮你填。'}
                </p>
              </div>
              <div>
                <div
                  className="font-display font-semibold uppercase text-3"
                  style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
                >
                  在健身房哪个区
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {ZONES.map((z) => {
                    const active = form.zone === z.id;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => patch({ zone: z.id })}
                        aria-pressed={active}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 4px',
                          minHeight: 72,
                          background: active ? 'var(--accent-dim)' : 'var(--bg-inset)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: active ? 'var(--accent)' : 'var(--text-2)',
                          fontSize: 13,
                          fontWeight: 500,
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <img src={z.svg} alt="" style={{ width: 48, aspectRatio: '8 / 5', display: 'block', borderRadius: 2 }} />
                        {z.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 场地多选（至少一个）：这个动作在哪些场地能做 */}
              <div>
                <div
                  className="font-display font-semibold uppercase text-3"
                  style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
                >
                  哪些场地能做（至少选一个）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {VENUE_OPTIONS.map((v) => {
                    const active = form.venues.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleVenue(v.id)}
                        style={{
                          minHeight: 56,
                          background: active ? 'var(--accent-dim)' : 'var(--bg-inset)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: active ? 'var(--accent)' : 'var(--text-1)',
                          fontSize: 16,
                          fontWeight: 600,
                          fontFamily: 'var(--font-body)',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="器械名称" value={form.equipName} onChange={(v) => patch({ equipName: v })} placeholder="如：坐姿推胸机" />
              <FieldArea
                label="长什么样"
                value={form.equipLook}
                onChange={(v) => patch({ equipLook: v })}
                placeholder="写给自己看的：长什么样、有什么特征……"
              />
              <FieldArea
                label="在哪找"
                value={form.equipWhere}
                onChange={(v) => patch({ equipWhere: v })}
                placeholder="在健身房哪个位置、挨着什么……"
                rows={2}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div
                  className="font-display font-semibold uppercase text-3"
                  style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
                >
                  口语步骤（3-5 步）
                </div>
                {listEditor('steps', 6, (i) => `第 ${i + 1} 步，怎么做……`, '+ 加一步')}
              </div>
              <FieldArea
                label="邪修口诀"
                value={form.mantra}
                onChange={(v) => patch({ mantra: v })}
                placeholder='有没有一句好记的话？没有就写"慢点做"'
                rows={2}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Stepper label="组数" value={form.sets} onChange={(v) => patch({ sets: v })} min={1} max={10} unit="组" />
                <Field label="次数" value={form.reps} onChange={(v) => patch({ reps: v })} placeholder="如：12次 / 力竭" />
              </div>
              <Field
                label="建议重量"
                value={form.suggestedWeight}
                onChange={(v) => patch({ suggestedWeight: v })}
                placeholder="如：从 5kg 开始，能标准做 12 次再加"
              />
              <div>
                <div
                  className="font-display font-semibold uppercase text-3"
                  style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
                >
                  组间休息
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[60, 90].map((s) => {
                    const active = form.restSeconds === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => patch({ restSeconds: s })}
                        aria-pressed={active}
                        style={{
                          minHeight: 56,
                          background: active ? 'var(--accent-dim)' : 'var(--bg-inset)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--line-strong)'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                          color: active ? 'var(--accent)' : 'var(--text-1)',
                          fontSize: 16,
                          fontWeight: 600,
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <span className="num">{s}</span> 秒
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>单侧动作</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                    一手/一腿轮流做的动作，开了自动带「先做左侧」规则
                  </div>
                </div>
                <RowToggle on={form.unilateral} onChange={(v) => patch({ unilateral: v })} label="单侧动作" />
              </div>
              <div>
                <div
                  className="font-display font-semibold uppercase text-3"
                  style={{ fontSize: 13, letterSpacing: '0.14em', marginBottom: 8 }}
                >
                  常见错误（最多 3 条）
                </div>
                {listEditor('mistakes', 3, () => '最容易犯的错，如：耸肩借力', '+ 加一条')}
              </div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {/* 底部导航按钮 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        {step > 0 ? (
          <GhostButton onClick={() => setStep((s) => s - 1)} icon={<Icon name="arrow-left" size={18} />}>
            上一步
          </GhostButton>
        ) : null}
        {step < 3 ? (
          <PrimaryButton onClick={() => setStep((s) => s + 1)} right={<Icon name="arrow-right" size={18} />}>
            下一步
          </PrimaryButton>
        ) : (
          <PrimaryButton
            disabled={missing.length > 0}
            onClick={handleSave}
            icon={<Icon name="check" size={20} />}
          >
            {isEdit ? '保存修改' : '存进动作库'}
          </PrimaryButton>
        )}
      </div>
      {step === 3 && missing.length > 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--warn)' }}>
          还不能存，缺：{missing.join('、')}。动作六要素不全就是空壳，练的时候没法用。
        </p>
      ) : null}
    </div>
  );
}

export default CustomExerciseForm;
