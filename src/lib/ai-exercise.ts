/**
 * 自建动作 AI 补全：DeepSeek 生成动作草稿（六要素 + 场地），预填进自建表单。
 * fetch 写法参考 src/lib/ai.ts（OpenAI 兼容 chat/completions 直连）。
 * 失败（网络/非 200/JSON 解析失败）一律抛错，由表单提示「AI 没听懂，手动填吧」。
 */
import type { Exercise, Venue } from './types';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = [
  '你是 NSCA 认证教练，为一个中文健身 App 生成动作数据。',
  '严格返回 JSON（不要 markdown 代码块、不要任何额外文字），字段如下：',
  '{',
  '  "muscle": "目标肌肉，如：背阔肌、大圆肌",',
  '  "equipment": {',
  '    "name": "器械名称",',
  '    "look": "长什么样（口语描述，写给不认识器械的新手）",',
  '    "where": "在健身房哪个区域找（口语，一句话）"',
  '  },',
  '  "steps": ["口语步骤，3-5 条，每步一句画面感的话"],',
  '  "mantra": "邪修口诀：一句好记的画面感提示",',
  '  "sets": 3到5的整数,',
  '  "reps": "次数/时长描述，如：12次、每侧10次、力竭、30秒",',
  '  "suggestedWeight": "建议重量：保守起步 + 加重标准，口语一句",',
  '  "commonMistakes": ["常见错误2-3条，格式：错误做法：怎么纠正"],',
  '  "unilateral": true或false（单手/单腿轮流做的动作为 true）,',
  '  "restSeconds": 60或90（复合大动作 90，单关节小动作 60）,',
  '  "venues": ["从 gym / home / outdoor / bodyweight 中选，可多选。gym=专业健身房，home=居家(瑜伽垫/弹力带/小哑铃)，outdoor=户外(单杠/双杠/跑道)，bodyweight=纯自重"],',
  '  "kcalPerSet": 3到15的数（每组估算消耗大卡）,',
  '  "videoKeyword": "B站搜索关键词（动作名+教学类词）",',
  '  "voiceScript": "80字内口语教练口吻的朗读脚本：器械+怎么开始+一个关键提醒"',
  '}',
  '全部中文、口语化，像私教在耳边说话，不堆术语；重量建议保守（给零基础新手起步用）。',
].join('\n');

interface DeepSeekResponse {
  choices?: { message?: { content?: string } }[];
}

/* ---------- 字段清洗：AI 返回什么脾气都有，只收能用的 ---------- */

function asStr(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function asStrList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asStr).filter(Boolean).slice(0, max);
}

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

const VALID_VENUES = new Set<Venue>(['gym', 'home', 'outdoor', 'bodyweight']);

function asVenues(v: unknown): Venue[] {
  if (!Array.isArray(v)) return [];
  const out: Venue[] = [];
  for (const item of v) {
    const s = asStr(item) as Venue;
    if (VALID_VENUES.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 把模型输出清洗成 Partial<Exercise>：只放校验通过的字段，空的字段不放（表单保留原值） */
function sanitize(raw: string): Partial<Exercise> {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 没有返回 JSON 对象');
  const o = JSON.parse(match[0]) as Record<string, unknown>;

  const draft: Partial<Exercise> = {};

  const muscle = asStr(o.muscle);
  if (muscle) draft.muscle = muscle;

  const eq = (o.equipment ?? {}) as Record<string, unknown>;
  const equipment = { name: asStr(eq.name), look: asStr(eq.look), where: asStr(eq.where) };
  if (equipment.name || equipment.look || equipment.where) draft.equipment = equipment;

  const steps = asStrList(o.steps, 5);
  if (steps.length > 0) draft.steps = steps;

  const mantra = asStr(o.mantra);
  if (mantra) draft.mantra = mantra;

  const sets = clampInt(o.sets, 1, 10);
  if (sets !== null) draft.sets = sets;

  const reps = asStr(o.reps);
  if (reps) draft.reps = reps;

  const suggestedWeight = asStr(o.suggestedWeight);
  if (suggestedWeight) draft.suggestedWeight = suggestedWeight;

  const mistakes = asStrList(o.commonMistakes, 3);
  if (mistakes.length > 0) draft.commonMistakes = mistakes;

  if (typeof o.unilateral === 'boolean') draft.unilateral = o.unilateral;

  draft.restSeconds = Number(o.restSeconds) === 90 ? 90 : 60;

  const venues = asVenues(o.venues);
  if (venues.length > 0) draft.venues = venues;

  const kcalPerSet = clampInt(o.kcalPerSet, 3, 15);
  if (kcalPerSet !== null) draft.kcalPerSet = kcalPerSet;

  const videoKeyword = asStr(o.videoKeyword);
  if (videoKeyword) draft.videoKeyword = videoKeyword;

  const voiceScript = asStr(o.voiceScript);
  if (voiceScript) draft.voiceScript = voiceScript;

  // 一个能用的字段都没有 = 没听懂
  const usable = draft.muscle || draft.steps || draft.mantra || draft.equipment;
  if (!usable) throw new Error('AI 返回的内容没有可用字段');
  return draft;
}

/**
 * 生成动作草稿。
 * @param name 用户输入的动作名
 * @param key  DeepSeek API Key（useSettings().deepseekKey）
 */
export async function generateExerciseDraft(name: string, key: string): Promise<Partial<Exercise>> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `动作名：${name}\n用户水平：健身零基础，左右力量不平衡（右臂强于左臂），单侧动作必须左侧先做。重量建议按零基础保守给。`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek 请求失败（${res.status}）`);
  const data = (await res.json()) as DeepSeekResponse;
  const content = data.choices?.[0]?.message?.content ?? '';
  return sanitize(content);
}
