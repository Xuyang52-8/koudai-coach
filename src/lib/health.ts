/**
 * Health Connect 直连 + 跑步截图识别（v1.5）
 *
 * 三条数据通路（按优先级）：
 * 1. Health Connect 原生插件（android/.../HealthConnectPlugin.kt）——读小米运动健康/Keep
 *    共享进来的运动记录（距离/时长/热量）和睡眠。仅原生壳内可用，网页端全部回落 false/null。
 * 2. 截图 AI 识别：复用设置里的视觉端点（与拍照识餐同一套配置），读跑步结算图。
 * 3. 手动补录：距离×体重公式估算（约 1 大卡/kg/km，跑步经典口径）。
 */
import { registerPlugin } from '@capacitor/core';
import { getSettings } from './store';

/* ================= Health Connect 原生桥 ================= */

export interface HealthSession {
  title: string;
  exerciseType: string;
  startMillis: number;
  minutes: number;
  kcal: number;
  distanceKm: number;
}

interface HealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestPermissions(): Promise<{ granted: boolean; reason?: string }>;
  hasPermissions(): Promise<{ granted: boolean }>;
  readExercise(opts: { days: number }): Promise<{ sessions: HealthSession[] }>;
  readLastSleep(): Promise<{ found: boolean; minutes?: number; hours?: number; endMillis?: number; startMillis?: number }>;
}

const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect');

export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

/** Health Connect 在本机可用（装了谷歌健康数据平台且原生壳） */
export async function healthConnectAvailable(): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    const r = await HealthConnect.isAvailable();
    return r.available;
  } catch {
    return false;
  }
}

/** 请求健康数据读取权限，返回是否拿到 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    const r = await HealthConnect.requestPermissions();
    return r.granted;
  } catch {
    return false;
  }
}

/** 读最近 days 天的运动记录 */
export async function readHealthExercise(days = 1): Promise<HealthSession[]> {
  if (!isNativeShell()) return [];
  try {
    const r = await HealthConnect.readExercise({ days });
    return r.sessions ?? [];
  } catch {
    return [];
  }
}

/** 读最近一次睡眠（小时） */
export async function readLastSleepHours(): Promise<number | null> {
  if (!isNativeShell()) return null;
  try {
    const r = await HealthConnect.readLastSleep();
    return r.found && typeof r.hours === 'number' ? r.hours : null;
  } catch {
    return null;
  }
}

/* ================= 截图 AI 识别（复用视觉端点配置） ================= */

export interface RunPhotoResult {
  label: string | null;
  distanceKm: number | null;
  minutes: number | null;
  kcal: number | null;
}

const RUN_VISION_PROMPT = `这是一张运动 App（如 Keep、小米运动健康）的运动结算截图，或跑步机/椭圆机的屏幕照片。
请读出四项：运动名称、距离（公里）、时长（分钟）、消耗热量（大卡）。
只输出一行 JSON，不要任何多余文字：
{"label":"跑步","distanceKm":3.2,"minutes":25,"kcal":210}
读不出的字段填 null。这不是运动截图/机器屏幕时输出 {"label":null,"distanceKm":null,"minutes":null,"kcal":null}`;

/**
 * 识别跑步截图。需要设置里 visionEndpoint+visionKey+visionModel 齐全（与拍照识餐同配置），否则抛错。
 */
export async function estimateRunPhoto(base64: string): Promise<RunPhotoResult> {
  const { visionEndpoint, visionKey, visionModel } = getSettings();
  if (!visionEndpoint || !visionKey || !visionModel) {
    throw new Error('截图识别还没配置：去"我的"页填视觉识别端点、Key 和模型名（和拍照识餐同一套）');
  }
  const endpoint = visionEndpoint.replace(/\/+$/, '');
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${visionKey}` },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: RUN_VISION_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`识别请求失败（${res.status}）`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  const m = /\{[\s\S]*\}/.exec(content);
  if (!m) return { label: null, distanceKm: null, minutes: null, kcal: null };
  try {
    const parsed = JSON.parse(m[0]) as RunPhotoResult;
    return {
      label: parsed.label ?? null,
      distanceKm: typeof parsed.distanceKm === 'number' ? parsed.distanceKm : null,
      minutes: typeof parsed.minutes === 'number' ? parsed.minutes : null,
      kcal: typeof parsed.kcal === 'number' ? parsed.kcal : null,
    };
  } catch {
    return { label: null, distanceKm: null, minutes: null, kcal: null };
  }
}

/* ================= 手动补录估算 ================= */

/**
 * 跑步热量估算：体重(kg) × 距离(km) ≈ 大卡（经典口径，与配速关系不大）。
 * 没有距离只有时长时：按慢跑 8 大卡/分钟估。
 */
export function estimateRunKcal(weightKg: number, distanceKm: number | null, minutes: number | null): number {
  if (distanceKm && distanceKm > 0) return Math.round(weightKg * distanceKm);
  if (minutes && minutes > 0) return Math.round(minutes * 8);
  return 0;
}
