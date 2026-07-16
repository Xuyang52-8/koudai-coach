/**
 * AI 食物估算
 * - estimateFoodText：有 DeepSeek Key 走 API，失败/无 Key 降级本地模糊匹配 nutrition.json
 * - estimateFoodPhoto：需 visionEndpoint+visionKey+visionModel 齐全（OpenAI 兼容 vision 格式），否则抛错
 * - testDeepSeekKey：极短请求验证 Key 连通性
 * 口吻：热量永远是估算，"约 650 大卡"。
 */
import { getSettings } from './store';
import nutritionJson from '../data/nutrition.json';
import type { FoodEstimateItem, FoodEstimateResult, FoodItem } from './types';

const foods = nutritionJson.foods as FoodItem[];

const SYSTEM_PROMPT = [
  '你是一个中餐热量估算助手。用户会用口语描述吃了什么（可能包含分量和餐次）。',
  '请估算每种食物的热量和蛋白质，只返回 JSON 数组，不要任何额外文字或代码块标记：',
  '[{"label":"食物名（带分量）","kcal":热量整数,"protein":蛋白质克数整数}]',
  '估算偏保守，中式快餐常见分量。不确定就给出常见分量的中间值。',
].join('\n');

const VISION_PROMPT = [
  '这是一张食物照片。请识别图中有哪些食物，估算每种的热量和蛋白质。',
  '只返回 JSON 数组，不要任何额外文字或代码块标记：',
  '[{"label":"食物名（带分量）","kcal":热量整数,"protein":蛋白质克数整数}]',
  '看不清的食物按常见分量给中间值。',
].join('\n');

/** 从模型回复文本里抠出 JSON 数组 */
function parseItemsJson(text: string): FoodEstimateItem[] {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI 没有返回 JSON 数组');
  const arr = JSON.parse(match[0]) as unknown[];
  return arr
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      return {
        label: String(o.label ?? o.name ?? '未知食物'),
        kcal: Math.max(0, Math.round(Number(o.kcal) || 0)),
        protein: Math.max(0, Math.round(Number(o.protein) || 0)),
        source: 'ai' as const,
      };
    })
    .filter((it) => it.label && it.kcal > 0);
}

/** 本地模糊匹配：name + aliases 双向包含匹配 */
export function matchLocalFoods(text: string): FoodEstimateItem[] {
  const query = text.trim();
  if (!query) return [];
  // 按标点/空格切成若干片段，逐段匹配，支持"鸡腿+米饭+青菜"这种一句话多样
  const segments = query.split(/[,，、+＋\s]+/).filter(Boolean);
  const results: FoodEstimateItem[] = [];
  const used = new Set<string>();

  const tryMatch = (seg: string) => {
    let best: FoodItem | null = null;
    for (const food of foods) {
      const candidates = [food.name, ...food.aliases];
      for (const c of candidates) {
        if (!c) continue;
        // 双向包含：用户说"葱油鸡"能命中"老乡鸡葱油鸡（去皮）"，说"老乡鸡的葱油鸡"也能命中
        if (seg.includes(c) || c.includes(seg)) {
          if (!best || c.length > (best.aliases.find((a) => seg.includes(a) || a.includes(seg)) ?? '').length) {
            best = food;
          }
        }
      }
    }
    if (best && !used.has(best.name)) {
      used.add(best.name);
      results.push({
        label: `${best.name}（${best.unit}）`,
        kcal: best.kcal,
        protein: Math.round(best.protein),
        source: 'local',
      });
    }
  };

  for (const seg of segments) tryMatch(seg);
  // 整句再试一次，兜住"老乡鸡葱油鸡"这种跨片段词
  if (results.length === 0) tryMatch(query);
  return results;
}

async function callDeepSeek(apiKey: string, userText: string): Promise<FoodEstimateItem[]> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek 请求失败（${res.status}）`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  return parseItemsJson(content);
}

/**
 * 文字估算食物热量。
 * 有 deepseekKey 走 DeepSeek；失败或无 Key 自动降级本地模糊匹配（source 标记区分）。
 */
export async function estimateFoodText(text: string): Promise<FoodEstimateResult> {
  const { deepseekKey } = getSettings();
  if (deepseekKey) {
    try {
      const items = await callDeepSeek(deepseekKey, text);
      if (items.length > 0) return { items };
    } catch {
      // 降级本地
    }
  }
  return { items: matchLocalFoods(text) };
}

/**
 * 拍照估算。仅在 visionEndpoint+visionKey+visionModel 配置齐全时可用，
 * 否则抛错（UI 应提示用户去"我的"页配置）。
 * @param base64 不含 data: 前缀的纯 base64 字符串
 */
export async function estimateFoodPhoto(base64: string): Promise<FoodEstimateResult> {
  const { visionEndpoint, visionKey, visionModel } = getSettings();
  if (!visionEndpoint || !visionKey || !visionModel) {
    throw new Error('拍照估算还没配置：去"我的"页填视觉识别端点、Key 和模型名');
  }
  const endpoint = visionEndpoint.replace(/\/+$/, '');
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${visionKey}`,
    },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`视觉识别请求失败（${res.status}）`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  return { items: parseItemsJson(content) };
}

/** 验证 DeepSeek Key 连通性：发一个极短请求 */
export async function testDeepSeekKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'Key 无效（401），检查一下有没有复制完整' };
    return { ok: false, error: `连接失败（${res.status}），稍后再试` };
  } catch {
    return { ok: false, error: '网络不通，检查网络后重试' };
  }
}
