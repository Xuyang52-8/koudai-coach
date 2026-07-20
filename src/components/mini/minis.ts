/**
 * 日常小练：数据访问 + 性别过滤/置顶排序 + 阶段组展开成时间轴（纯函数，冒烟测试直接复用）。
 * 数据源 src/data/minis.json，类型契约见 lib/types.ts 的 MiniPack/MiniPhaseGroup。
 */
import minisJson from '../../data/minis.json';
import type { MiniPack, MiniPhase, MiniPhaseGroup, UserProfile } from '../../lib/types';

export const MINI_PACKS = minisJson as MiniPack[];

export function getMiniPack(id: string | undefined): MiniPack | null {
  if (!id) return null;
  return MINI_PACKS.find((p) => p.id === id) ?? null;
}

/**
 * 凯格尔按 profile.gender 过滤：男不显女版、女不显男版；
 * 未填（无 profile）时两个版本都显示。audience==='all' 的包任何情况都显示。
 */
export function filterMinisForProfile(profile: UserProfile | null | undefined): MiniPack[] {
  const sex = profile?.gender;
  return MINI_PACKS.filter((p) => p.audience === 'all' || !sex || p.audience === sex);
}

/**
 * 排序：问卷「额外加强」选中的包置顶（保持数据内相对顺序），其余按数据顺序。
 * extras 缺省/含 'none' 时原样返回。
 */
export function sortMinisForProfile(packs: MiniPack[], profile: UserProfile | null | undefined): MiniPack[] {
  const extras = (profile?.extras ?? []).filter((e) => e !== 'none');
  if (extras.length === 0) return packs;
  const picked = packs.filter((p) => p.goalTag !== undefined && extras.includes(p.goalTag));
  const rest = packs.filter((p) => !(p.goalTag !== undefined && extras.includes(p.goalTag)));
  return [...picked, ...rest];
}

/** 未填性别时两个凯格尔版本都显示，用全名区分；已知性别只显示一版时用通用名"盆底肌训练" */
export function miniDisplayName(pack: MiniPack, profile: UserProfile | null | undefined): string {
  if (pack.audience === 'all') return pack.name;
  return profile?.gender ? pack.name.replace(/（(男|女)）$/, '') : pack.name;
}

/* ================= 时间轴展开 ================= */

export interface MiniStep {
  phase: MiniPhase;
  /** 全局第几步（0-based） */
  index: number;
  /** 总步数 */
  total: number;
  /** 组内第几轮（1-based），组无循环时恒为 1 */
  round: number;
  /** 组总轮数 */
  roundTotal: number;
  /** 组下标（0-based） */
  groupIndex: number;
  /** 组总数 */
  groupCount: number;
  /** 顶部计数文案：循环组 "第 3/10 轮"，否则 "第 2/6 部分" */
  counter: string;
}

/** 把阶段组（含 rounds 循环）展开成逐步时间轴 */
export function expandTimeline(groups: MiniPhaseGroup[]): MiniStep[] {
  const steps: MiniStep[] = [];
  const groupCount = groups.length;
  groups.forEach((g, groupIndex) => {
    const roundTotal = Math.max(1, g.rounds ?? 1);
    for (let round = 1; round <= roundTotal; round++) {
      for (const phase of g.phases) {
        steps.push({
          phase,
          index: steps.length,
          total: 0, // 展开完成后统一回填
          round,
          roundTotal,
          groupIndex,
          groupCount,
          counter: roundTotal > 1 ? `第 ${round}/${roundTotal} 轮` : `第 ${groupIndex + 1}/${groupCount} 部分`,
        });
      }
    }
  });
  return steps.map((s) => ({ ...s, total: steps.length }));
}

/** 整包总秒数（含 rounds 展开） */
export function totalSeconds(pack: MiniPack): number {
  return pack.phases.reduce((sum, g) => sum + Math.max(1, g.rounds ?? 1) * g.phases.reduce((s, p) => s + p.secs, 0), 0);
}
