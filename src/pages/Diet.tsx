/**
 * 饮食页（/diet）
 * 实现规格：/mnt/agents/output/design/diet.md
 * - §1 今日两条进度条（热量 / 蛋白质，超标段 warn，口语评语打字机逐字出现）
 * - §2 三通道记录：文字 / 语音（webkitSpeechRecognition，不支持则置灰）/ 拍照（OpenAI 兼容视觉端点）
 * - §3 估算结果 BottomSheet：删项、±0.5 份微调、选餐次、确认入库 + 打勾震动
 * - §4 补剂卡：蛋白粉状态机（未到训练/练完待喝/已喝）+ 肌酸打卡（与 summary 共享状态）
 * - §5 今日流水（按餐次分组，可删）+ 饮食建议折叠区
 * 铁律：热量永远"约"，无克数输入框，无图表。
 */
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';
import { useNavigate } from 'react-router';
import BottomSheet from '../components/BottomSheet';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import EmptyState from '../components/EmptyState';
import { useFeedback, vibrate } from '../components/feedback';
import Icon from '../components/Icon';
import ProgressBar from '../components/ProgressBar';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import Tag from '../components/Tag';
import TTSToggle from '../components/TTSToggle';
import nutritionJson from '../data/nutrition.json';
import { estimateFoodPhoto, estimateFoodText } from '../lib/ai';
import {
  addDietEntry,
  getSupplements,
  removeDietEntry,
  shiftDate,
  todayStr,
  toggleSupplement,
  useCycle,
  useDietEntries,
  useSettings,
  useSupplements,
  useTargets,
} from '../lib/store';
import type { DietEntry, FoodEstimateItem, MealType, Supplement } from '../lib/types';

const supplements = nutritionJson.supplements as Supplement[];

const MEAL_LABEL: Record<MealType, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const EASE_BAR: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** 估算结果编辑态：qty 为份数（0.5 步进），kcal/protein 为 1 份基准值 */
interface EditItem extends FoodEstimateItem {
  qty: number;
}

/* ================= 语音识别最小类型（webkitSpeechRecognition） ================= */

interface RecogAlternative {
  transcript: string;
}
interface RecogResult {
  0: RecogAlternative;
  isFinal: boolean;
  length: number;
}
interface RecogEvent {
  results: ArrayLike<RecogResult>;
}
interface RecogInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecogEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecogCtor = new () => RecogInstance;

const SpeechRecognitionCtor: RecogCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecogCtor; webkitSpeechRecognition?: RecogCtor })
        .SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: RecogCtor; webkitSpeechRecognition?: RecogCtor })
        .webkitSpeechRecognition);

/* ================= 纯函数 ================= */

/** 餐次按当前时间预选：11 点前早 / 11-15 午 / 15-21 晚 / 21 点后加餐 */
function autoMeal(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function kcalComment(kcal: number, target: number): string {
  const r = target > 0 ? kcal / target : 0;
  if (r > 1) return '超了点，没事，明天训练多练一组就行。';
  if (r >= 0.85) return '快满了，晚饭清淡点。';
  if (r >= 0.5) return '节奏不错，晚饭正常吃。';
  return '还有大把额度，蛋白质优先。';
}

function proteinComment(got: number, target: number): string {
  const need = Math.max(0, Math.round(target - got));
  if (need <= 0) return '蛋白质够了，漂亮。';
  if (need <= 25) return `还差约 ${need}g，一杯蛋白粉或两个鸡蛋就补上。`;
  if (need <= 55) return '蛋白质还差一巴掌大的鸡胸肉。';
  if (need <= 85) return `还差约 ${need}g，差不多两个鸡腿。`;
  return `还差约 ${need}g，一杯蛋白粉加一巴掌大的鸡胸肉。`;
}

/** 图片压缩到 ≤1024px 并转纯 base64（不含 data: 前缀） */
async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，换一张试试'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('图片解析失败，换一张试试'));
    el.src = dataUrl;
  });
  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl.split(',')[1] ?? '';
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.8);
  return out.split(',')[1] ?? '';
}

/** 肌酸连续打卡天数（今天没喝则从昨天往前数） */
function creatineStreak(): number {
  let n = 0;
  let d = todayStr();
  if (!getSupplements(d).creatine) d = shiftDate(d, -1);
  while (n < 60 && getSupplements(d).creatine) {
    n += 1;
    d = shiftDate(d, -1);
  }
  return n;
}

/* ================= 小组件 ================= */

/** 数字滚动（tnum），进度变化时 0→当前值 600ms */
function AnimatedNumber({ value, style }: { value: number; style?: CSSProperties }): JSX.Element {
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)));
  useEffect(() => {
    const controls = animate(count, value, reduce ? { duration: 0.1 } : { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, count, reduce]);
  return (
    <motion.span className="num" style={style}>
      {rounded}
    </motion.span>
  );
}

/** 评语打字机：30ms/字，换文案时重新打；reduced-motion 直接全显 */
function useTypewriter(text: string): string {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (reduce) return; // reduced-motion：直接渲染全文（见 return）
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [text, reduce]);
  return reduce ? text : shown;
}

/** 估算中 loading 圆环（accent 描边旋转 700ms 循环） */
function Spinner({ tone = 'dark' }: { tone?: 'dark' | 'accent' }): JSX.Element {
  const reduce = useReducedMotion();
  const track = tone === 'dark' ? 'rgba(6,6,7,.3)' : 'var(--accent-dim)';
  const head = tone === 'dark' ? '#060607' : 'var(--accent)';
  return (
    <motion.span
      animate={reduce ? undefined : { rotate: 360 }}
      transition={reduce ? { duration: 0.1 } : { repeat: Infinity, duration: 0.7, ease: 'linear' }}
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: `2px solid ${track}`,
        borderTopColor: head,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

/** 步进器减号图标（Icon 库里没有 minus） */
function MinusIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

/* ================= §1 今日两条进度条 ================= */

function ProgressSection({ entries }: { entries: DietEntry[] }): JSX.Element {
  const reduce = useReducedMotion();
  // 动态营养目标：有档案按 Mifflin 算，无档案回落 nutrition.json 静态值
  const targets = useTargets();
  const totalKcal = entries.reduce((s, e) => s + e.kcal, 0);
  const totalProtein = entries.reduce((s, e) => s + e.protein, 0);
  const kcalOver = totalKcal > targets.targetKcal;
  const kcalLine = useTypewriter(kcalComment(totalKcal, targets.targetKcal));
  const proteinLine = useTypewriter(proteinComment(totalProtein, targets.proteinG));

  return (
    <section
      style={{
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        padding: '20px 0',
      }}
    >
      {/* 热量 */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          热量
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>约</span>
          <AnimatedNumber
            value={totalKcal}
            style={{
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1,
              color: kcalOver ? 'var(--warn)' : 'var(--text-1)',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>/ 约 {targets.targetKcal} 大卡</span>
        </span>
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.1 : 0.3 }}
        style={{ marginTop: 10 }}
      >
        <ProgressBar value={totalKcal} max={targets.targetKcal} hideNumbers />
      </motion.div>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: kcalOver ? 'var(--warn)' : 'var(--text-2)', lineHeight: 1.5, minHeight: 20 }}>
        {kcalLine}
      </p>

      {/* 蛋白质 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 20,
        }}
      >
        <span className="font-display font-semibold uppercase text-3" style={{ fontSize: 13, letterSpacing: '0.14em' }}>
          蛋白质
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>约</span>
          <AnimatedNumber
            value={totalProtein}
            style={{
              fontSize: 24,
              fontWeight: 600,
              lineHeight: 1,
              color: totalProtein >= targets.proteinG ? 'var(--accent)' : 'var(--text-1)',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>g / {targets.proteinG}g</span>
        </span>
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0.1 } : { duration: 0.3, delay: 0.15 }}
        style={{ marginTop: 10 }}
      >
        <ProgressBar value={totalProtein} max={targets.proteinG} hideNumbers />
      </motion.div>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, minHeight: 20 }}>
        {proteinLine}
      </p>
    </section>
  );
}

/* ================= 顶部日期切换（最多回看 7 天，未来不可点） ================= */

function DateSwitcher({ offset, onChange }: { offset: number; onChange: (next: number) => void }): JSX.Element {
  const label = offset === 0 ? '今天' : offset === 1 ? '昨天' : shiftDate(todayStr(), -offset).slice(5).replace('-', '/');
  const btn = (disabled: boolean): CSSProperties => ({
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? 'var(--text-3)' : 'var(--text-1)',
    opacity: disabled ? 0.4 : 1,
    WebkitTapHighlightColor: 'transparent',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button type="button" aria-label="前一天" disabled={offset >= 7} onClick={() => onChange(Math.min(7, offset + 1))} style={btn(offset >= 7)}>
        <Icon name="arrow-left" size={18} />
      </button>
      <span className="num" style={{ minWidth: 52, textAlign: 'center', fontSize: 14, color: 'var(--text-2)' }}>
        {label}
      </span>
      <button type="button" aria-label="后一天" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - 1))} style={btn(offset <= 0)}>
        <Icon name="arrow-right" size={18} />
      </button>
    </div>
  );
}

/* ================= §2 快速记录条 ================= */

interface QuickLoggerProps {
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  onVoice: () => void;
  onCamera: () => void;
  busy: 'text' | 'photo' | null;
  recording: boolean;
  voiceSupported: boolean;
  hasDeepseekKey: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function QuickLogger({
  input,
  onInput,
  onSubmit,
  onVoice,
  onCamera,
  busy,
  recording,
  voiceSupported,
  hasDeepseekKey,
  inputRef,
}: QuickLoggerProps): JSX.Element {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  return (
    <section style={{ marginTop: 20 }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        记一笔，一句话就行。
      </p>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder="比如：中午吃了老乡鸡葱油鸡+半碗米饭"
        aria-label="吃了什么，一句话描述"
        style={{
          width: '100%',
          height: 64,
          boxSizing: 'border-box',
          background: 'var(--bg-inset)',
          border: '1px solid var(--line-strong)',
          borderRadius: 4,
          padding: '0 16px',
          fontSize: 16,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-body)',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        {/* 语音：录音中 accent 实心 + 外圈脉冲 ring 1s 循环 */}
        <motion.button
          type="button"
          onClick={onVoice}
          disabled={!voiceSupported || busy !== null}
          aria-pressed={recording}
          aria-label={voiceSupported ? (recording ? '停止录音' : '语音输入') : '浏览器不支持语音输入'}
          animate={
            recording && !reduce
              ? { boxShadow: ['0 0 0 0 rgba(63,225,177,.35)', '0 0 0 10px rgba(63,225,177,0)'] }
              : { boxShadow: '0 0 0 0 rgba(63,225,177,0)' }
          }
          transition={recording && !reduce ? { repeat: Infinity, duration: 1, ease: 'easeOut' } : { duration: 0.15 }}
          style={{
            flex: '0 0 88px',
            minHeight: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderRadius: 4,
            border: recording ? 'none' : '1px solid var(--line-strong)',
            background: recording ? 'var(--accent)' : 'transparent',
            color: recording ? '#060607' : 'var(--text-1)',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            cursor: !voiceSupported || busy !== null ? 'not-allowed' : 'pointer',
            opacity: !voiceSupported || busy !== null ? 0.45 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Icon name="mic" size={20} />
          {recording ? '在听，说' : '语音'}
        </motion.button>
        {/* 拍照 */}
        <button
          type="button"
          onClick={onCamera}
          disabled={busy !== null}
          aria-label="拍照识别"
          style={{
            flex: '0 0 88px',
            minHeight: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderRadius: 4,
            border: '1px solid var(--line-strong)',
            background: 'transparent',
            color: 'var(--text-1)',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            opacity: busy !== null ? 0.45 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {busy === 'photo' ? <Spinner tone="accent" /> : <Icon name="camera" size={20} />}
          拍照
        </button>
        {/* 记一笔 */}
        <PrimaryButton
          onClick={onSubmit}
          disabled={busy !== null || !input.trim()}
          icon={busy === 'text' ? <Spinner /> : <Icon name="arrow-right" size={20} />}
        >
          {busy === 'text' ? '估算中' : '记一笔'}
        </PrimaryButton>
      </div>
      {!voiceSupported ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
          你的浏览器不支持语音，打字吧。
        </p>
      ) : null}
      {!hasDeepseekKey ? (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          style={{
            display: 'block',
            margin: '10px 0 0',
            padding: '4px 0',
            background: 'transparent',
            border: 'none',
            fontSize: 13,
            color: 'var(--accent)',
            lineHeight: 1.5,
            textAlign: 'left',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          还没配 API Key？本地也能估算，去「我的」配上更准 →
        </button>
      ) : null}
    </section>
  );
}

/* ================= §3 估算结果 BottomSheet ================= */

interface EstimateSheetProps {
  items: EditItem[] | null;
  meal: MealType;
  onMeal: (m: MealType) => void;
  onChange: (items: EditItem[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function EstimateSheet({ items, meal, onMeal, onChange, onClose, onConfirm }: EstimateSheetProps): JSX.Element {
  const reduce = useReducedMotion();
  const open = items !== null;
  const list = items ?? [];
  const totalKcal = list.reduce((s, it) => s + Math.round(it.kcal * it.qty), 0);
  const totalProtein = list.reduce((s, it) => s + Math.round(it.protein * it.qty), 0);
  const rangeLo = Math.round((totalKcal * 0.85) / 10) * 10;
  const rangeHi = Math.round((totalKcal * 1.15) / 10) * 10;

  const setQty = (idx: number, delta: number) => {
    onChange(list.map((it, i) => (i === idx ? { ...it, qty: Math.min(10, Math.max(0.5, Math.round((it.qty + delta) * 2) / 2)) } : it)));
  };
  const removeItem = (idx: number) => {
    vibrate(15);
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="估算结果">
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
        <AnimatePresence initial={false}>
          {list.map((it, idx) => (
            <motion.div
              key={`${it.label}-${idx}`}
              layout="position"
              exit={reduce ? { opacity: 0 } : { x: -60, opacity: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.25 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>{it.label}</span>
                  <Tag>{it.source === 'ai' ? 'AI 估算' : '本地估算'}</Tag>
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-2)' }}>
                  <span className="num" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    约 {Math.round(it.kcal * it.qty)}
                  </span>{' '}
                  大卡 · 蛋白 约 {Math.round(it.protein * it.qty)}g
                </div>
              </div>
              {/* ±0.5 份步进 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="减半份"
                  onClick={() => setQty(idx, -0.5)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    border: '1px solid var(--line-strong)',
                    background: 'transparent',
                    color: 'var(--text-1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <MinusIcon />
                </button>
                <span className="num" style={{ minWidth: 40, textAlign: 'center', fontSize: 15, color: 'var(--text-1)' }}>
                  ×{it.qty}
                </span>
                <button
                  type="button"
                  aria-label="加半份"
                  onClick={() => setQty(idx, 0.5)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    border: '1px solid var(--line-strong)',
                    background: 'transparent',
                    color: 'var(--text-1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <button
                type="button"
                aria-label={`删除 ${it.label}`}
                onClick={() => removeItem(idx)}
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {list.length === 0 ? (
          <p style={{ margin: '18px 0 4px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, textAlign: 'center' }}>
            都删光了。关掉重新记，或者直接取消。
          </p>
        ) : (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
            合计 约 {totalKcal} 大卡 · 蛋白 约 {totalProtein}g · 估算范围 {rangeLo}~{rangeHi}，差不离。
          </p>
        )}

        {/* 餐次选择 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {MEAL_ORDER.map((m) => {
            const active = meal === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onMeal(m)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 4,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 15,
                  fontWeight: active ? 600 : 500,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  transition: 'color 150ms, background 150ms, border-color 150ms',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {MEAL_LABEL[m]}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <PrimaryButton icon={<Icon name="check" size={20} />} disabled={list.length === 0} onClick={onConfirm}>
            记下，约 {totalKcal} 大卡
          </PrimaryButton>
        </div>
        <div style={{ marginTop: 10 }}>
          <GhostButton size="sm" onClick={onClose}>
            不对，重来
          </GhostButton>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ================= 拍照识别配置引导 Sheet ================= */

function VisionGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const navigate = useNavigate();
  return (
    <BottomSheet open={open} onClose={onClose} title="拍照识别还差一步">
      <div style={{ paddingBottom: 4 }}>
        <p style={{ margin: '4px 0 0', fontSize: 16, lineHeight: 1.65, color: 'var(--text-1)' }}>
          拍照识别走 OpenAI 兼容的视觉 API，智谱 GLM-4V、通义 Qwen-VL 都行。
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          去「我的」页填好视觉端点、Key 和模型名三件套，回来拍张照就能估。
        </p>
        <div style={{ marginTop: 16 }}>
          <PrimaryButton
            icon={<Icon name="arrow-right" size={20} />}
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
          >
            去配置
          </PrimaryButton>
        </div>
        <div style={{ marginTop: 10 }}>
          <GhostButton size="sm" onClick={onClose}>
            先打字记
          </GhostButton>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ================= §5 今日记录流水 ================= */

function DiaryList({
  entries,
  isToday,
  onDelete,
  onFirst,
}: {
  entries: DietEntry[];
  isToday: boolean;
  onDelete: (id: string) => void;
  onFirst: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const groups = MEAL_ORDER.map((m) => ({ meal: m, items: entries.filter((e) => e.meal === m) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="流水">{isToday ? '今天记了这些' : '这天记了这些'}</SectionLabel>
      {groups.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState text="还没记。中午吃了啥？一句话告诉我。" actionLabel="记第一笔" onAction={onFirst} />
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {groups.map((g, gi) => {
            const subtotal = g.items.reduce((s, e) => s + e.kcal, 0);
            return (
              <motion.div
                key={g.meal}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0.1 } : { delay: gi * 0.06, duration: 0.3, ease: 'easeOut' }}
              >
                <div
                  className="font-display font-semibold uppercase"
                  style={{ fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-3)', marginTop: gi === 0 ? 8 : 20 }}
                >
                  {MEAL_LABEL[g.meal]}
                </div>
                <div>
                  <AnimatePresence initial={false}>
                    {g.items.map((e) => (
                      <motion.div
                        key={e.id}
                        layout="position"
                        exit={reduce ? { opacity: 0 } : { x: -60, opacity: 0 }}
                        transition={{ duration: reduce ? 0.1 : 0.25 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          minHeight: 56,
                          padding: '10px 0',
                          borderBottom: '1px solid var(--line)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: 'var(--text-1)', lineHeight: 1.5 }}>
                          {e.label}
                        </span>
                        <span style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span className="num" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-1)' }}>
                            约 {e.kcal}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 4 }}>大卡</span>
                          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-3)' }}>蛋白 ~{e.protein}g</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`删除 ${e.label}`}
                          onClick={() => onDelete(e.id)}
                          style={{
                            width: 40,
                            height: 40,
                            flexShrink: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <Icon name="trash" size={18} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>
                  {MEAL_LABEL[g.meal]} · 约 {subtotal} 大卡
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ================= §4 补剂卡 ================= */

function SupplementRows(): JSX.Element {
  const [cycle] = useCycle();
  const [supp] = useSupplements();
  const { celebrate, vibrate: fbVibrate } = useFeedback();
  const reduce = useReducedMotion();
  const trainedToday = cycle.lastTrainingDate === todayStr();
  // supp 变化会触发本组件重渲染，直接即时计算即可
  const streak = creatineStreak();
  const whey = supplements.find((s) => s.id === 'whey');
  const creatine = supplements.find((s) => s.id === 'creatine');

  const toggle = (id: 'whey' | 'creatine') => {
    const nowOn = toggleSupplement(id);
    if (nowOn) {
      celebrate(id === 'whey' ? '蛋白粉打卡，30 分钟内喝掉' : '肌酸打卡，白天多喝水');
    } else {
      fbVibrate(15);
    }
  };

  const actionBtn = (
    checked: boolean,
    tone: 'accent' | 'warn' | 'grey',
    label: string,
    onClick: () => void,
  ): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      style={{
        flexShrink: 0,
        minWidth: 92,
        minHeight: 48,
        padding: '0 14px',
        borderRadius: 4,
        border: checked ? 'none' : tone === 'warn' ? '1px solid var(--warn)' : '1px solid var(--line-strong)',
        background: checked ? 'var(--accent)' : tone === 'warn' ? 'var(--warn-dim)' : 'transparent',
        color: checked ? '#060607' : tone === 'warn' ? 'var(--warn)' : 'var(--text-3)',
        fontSize: 15,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: 'pointer',
        transition: 'color 200ms, background 200ms, border-color 200ms',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {checked ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}
      {label}
    </button>
  );

  return (
    <section style={{ marginTop: 28 }}>
      <SectionLabel index="补剂">别忘了喝</SectionLabel>
      <div style={{ marginTop: 8 }}>
        {/* 蛋白粉：未到训练（灰）→ 练完待喝（warn）→ 已喝（accent） */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.1 } : { duration: 0.3, ease: 'easeOut' }}
          style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 72, padding: '10px 0' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}illust-shaker.svg`}
            alt="摇摇杯线稿"
            width={40}
            height={40}
            style={{ borderRadius: 4, border: '1px solid var(--line)', flexShrink: 0, display: 'block' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--text-1)' }}>蛋白粉</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              {whey?.timing ?? '训练后 30 分钟内'} · 1 勺
            </div>
          </div>
          {supp.whey
            ? actionBtn(true, 'accent', '已喝', () => toggle('whey'))
            : trainedToday
              ? actionBtn(false, 'warn', '现在喝', () => toggle('whey'))
              : actionBtn(false, 'grey', '练完才喝', () => toggle('whey'))}
        </motion.div>
        {/* 肌酸 */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.1 } : { delay: 0.1, duration: 0.3, ease: 'easeOut' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            minHeight: 72,
            padding: '10px 0',
            borderTop: '1px solid var(--line)',
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              border: '1px solid var(--line)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Icon name="droplet" size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--text-1)' }}>肌酸</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              每天 3-5g · 练不练都要喝
              {streak >= 2 ? <span style={{ color: 'var(--accent)' }}> · 连续 {streak} 天</span> : null}
            </div>
          </div>
          {supp.creatine
            ? actionBtn(true, 'accent', '已喝', () => toggle('creatine'))
            : actionBtn(false, 'accent', '喝了', () => toggle('creatine'))}
        </motion.div>
        {creatine ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{creatine.note}</p>
        ) : null}
      </div>
    </section>
  );
}

/* ================= §6 饮食建议（折叠区） ================= */

function TipsSection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const tips = nutritionJson.tips as string[];
  return (
    <section style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <SectionLabel index="建议">吃对不挨饿</SectionLabel>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: reduce ? 0.1 : 0.2 }}
          style={{ display: 'inline-flex', color: 'var(--text-3)' }}
        >
          <Icon name="arrow-right" size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="tips"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.3, ease: EASE_BAR }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 6 }}>
              {tips.map((tip, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    padding: '12px 0',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-2)',
                    borderBottom: i < tips.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  {tip}
                </p>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/* ================= 页面 ================= */

export default function Diet(): JSX.Element {
  const [settings] = useSettings();
  const [offset, setOffset] = useState(0);
  const date = useMemo(() => shiftDate(todayStr(), -offset), [offset]);
  const [entries] = useDietEntries(date);
  const { celebrate, toast, host } = useFeedback();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'text' | 'photo' | null>(null);
  const [sheetItems, setSheetItems] = useState<EditItem[] | null>(null);
  const [meal, setMeal] = useState<MealType>(() => autoMeal());
  const [visionGuideOpen, setVisionGuideOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* ---------- 语音 ---------- */
  const voiceSupported = Boolean(SpeechRecognitionCtor);
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<RecogInstance | null>(null);
  const finalRef = useRef('');
  const errorRef = useRef(false);

  useEffect(() => {
    return () => {
      recogRef.current?.abort();
    };
  }, []);

  /** 文字/语音共用估算流程 */
  async function runEstimate(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy('text');
    try {
      const { items } = await estimateFoodText(trimmed);
      if (items.length === 0) {
        toast('没估出来，换个说法试试，比如"葱油鸡加半碗米饭"');
        return;
      }
      // 配了 Key 却全部走了本地库 → 网络失败降级
      if (settings.deepseekKey && items.every((it) => it.source === 'local')) {
        toast('网不行，用了本地估算');
      }
      setSheetItems(items.map((it) => ({ ...it, qty: 1 })));
      setMeal(autoMeal());
    } catch {
      toast('网不行，稍后再试，或者换个说法');
    } finally {
      setBusy(null);
    }
  }

  function toggleVoice(): void {
    if (!voiceSupported || busy) return;
    if (recording) {
      recogRef.current?.stop();
      return;
    }
    const Ctor = SpeechRecognitionCtor;
    if (!Ctor) return;
    const recog = new Ctor();
    recog.lang = 'zh-CN';
    recog.interimResults = true;
    recog.continuous = false;
    finalRef.current = '';
    errorRef.current = false;
    recog.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const r = e.results[i];
        const t = r?.[0]?.transcript ?? '';
        if (r?.isFinal) final += t;
        else interim += t;
      }
      finalRef.current = final;
      setInput(final + interim);
    };
    recog.onerror = () => {
      errorRef.current = true;
      toast('没听清，打字吧');
    };
    recog.onend = () => {
      setRecording(false);
      recogRef.current = null;
      if (errorRef.current) return;
      const text = finalRef.current.trim();
      if (text) void runEstimate(text);
    };
    recogRef.current = recog;
    setRecording(true);
    vibrate(15);
    try {
      recog.start();
    } catch {
      setRecording(false);
      recogRef.current = null;
      toast('没听清，打字吧');
    }
  }

  /* ---------- 拍照 ---------- */
  function onCameraClick(): void {
    if (busy) return;
    const { visionEndpoint, visionKey, visionModel } = settings;
    if (!visionEndpoint || !visionKey || !visionModel) {
      setVisionGuideOpen(true);
      return;
    }
    fileRef.current?.click();
  }

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    try {
      const base64 = await fileToBase64(file);
      const { items } = await estimateFoodPhoto(base64);
      if (items.length === 0) {
        toast('没认出吃了啥，换张清楚的，或者打字吧');
        return;
      }
      setSheetItems(items.map((it) => ({ ...it, qty: 1 })));
      setMeal(autoMeal());
    } catch (err) {
      toast(err instanceof Error ? err.message : '拍照识别失败，打字记吧');
    } finally {
      setBusy(null);
    }
  }

  /* ---------- 入库 / 删除 ---------- */
  function confirmSheet(): void {
    if (!sheetItems || sheetItems.length === 0) return;
    const total = sheetItems.reduce((s, it) => s + Math.round(it.kcal * it.qty), 0);
    for (const it of sheetItems) {
      addDietEntry(
        {
          label: it.qty !== 1 ? `${it.label} ×${it.qty}` : it.label,
          kcal: Math.round(it.kcal * it.qty),
          protein: Math.round(it.protein * it.qty),
          meal,
          source: it.source,
        },
        date,
      );
    }
    setSheetItems(null);
    setInput('');
    celebrate(`记上了，这顿约 ${total} 大卡`);
  }

  function onDelete(id: string): void {
    vibrate(15);
    removeDietEntry(id, date);
  }

  return (
    <div>
      {host}
      <ScreenHeader
        label="饮食 · DIET"
        title="今天吃的"
        actions={
          <>
            <DateSwitcher offset={offset} onChange={setOffset} />
            <TTSToggle />
          </>
        }
      />

      <ProgressSection entries={entries} />

      <QuickLogger
        input={input}
        onInput={setInput}
        onSubmit={() => void runEstimate(input)}
        onVoice={toggleVoice}
        onCamera={onCameraClick}
        busy={busy}
        recording={recording}
        voiceSupported={voiceSupported}
        hasDeepseekKey={Boolean(settings.deepseekKey)}
        inputRef={inputRef}
      />

      <SupplementRows />

      <DiaryList entries={entries} isToday={offset === 0} onDelete={onDelete} onFirst={() => inputRef.current?.focus()} />

      <TipsSection />

      {/* 隐藏的文件选择器：调起系统相机/相册 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void onPhotoPicked(e)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <EstimateSheet
        items={sheetItems}
        meal={meal}
        onMeal={setMeal}
        onChange={setSheetItems}
        onClose={() => setSheetItems(null)}
        onConfirm={confirmSheet}
      />
      <VisionGuideSheet open={visionGuideOpen} onClose={() => setVisionGuideOpen(false)} />
    </div>
  );
}
