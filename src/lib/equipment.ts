/**
 * 我的器械：器械目录（src/data/equipment.json）+ 动作→器械映射 + 可用性判定。
 *
 * 判定铁律：用户健身房没有的器械，绝不推荐对应动作。
 * - owned === undefined/null：用户没设置过（老用户）→ 一切视为"都有"，不过滤。
 * - 动作没标 equipmentId 且名字也映射不上：写不清 → 保守视为"都有"。
 * - 否则动作所需每个器械 id 都必须在 owned 清单里（数组 = 缺一不可）。
 */
import equipmentJson from '../data/equipment.json';
import type { EquipmentCatalog, EquipmentGroup, EquipmentItem, EquipmentPreset, Exercise } from './types';

export const equipmentCatalog = equipmentJson as EquipmentCatalog;

/** 全部器械分组（页面分组勾选列表用） */
export const EQUIPMENT_GROUPS: EquipmentGroup[] = equipmentCatalog.groups;

/** 全部器械 id（目录顺序，"全选"与序列化保持这个顺序） */
export const ALL_EQUIPMENT_IDS: string[] = EQUIPMENT_GROUPS.flatMap((g) => g.items.map((it) => it.id));

/** id → 器械条目 */
export const EQUIPMENT_BY_ID: ReadonlyMap<string, EquipmentItem> = new Map(
  EQUIPMENT_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it] as const)),
);

/** 内置快捷预设（全套商健 / 我的健身房模板 / 宿舍简易） */
export const EQUIPMENT_PRESETS: EquipmentPreset[] = equipmentCatalog.presets;

export function getEquipmentPreset(id: string): EquipmentPreset | null {
  return EQUIPMENT_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * 动作 equipment.name（口语写法）→ 目录 id 映射表。
 * 给两类消费者用：① exercises.json 没补 equipmentId 的旧/自建动作兜底；② 冒烟核对。
 * 注意：只收"写得清"的；单杠/双杠/弹力带/瑜伽垫/毛巾/门框等目录外的一律不收——
 * 映射不上 = 保守按"都有"，绝不错杀。
 */
export const EQUIPMENT_NAME_TO_ID: Record<string, string | string[]> = {
  跑步机: 'treadmill',
  椭圆机: 'elliptical',
  划船机: 'rowing-machine',
  楼梯机: 'stair-climber',
  高位下拉机: 'lat-pulldown',
  坐姿划船机: 'seated-row',
  坐姿推胸机: 'chest-press',
  坐姿腿屈伸机: 'leg-extension',
  卷腹机: 'ab-crunch',
  '蝴蝶机（夹胸机）': 'pec-deck',
  '蝴蝶机（反向坐）': 'pec-deck',
  辅助引体向上机: 'assisted-pullup',
  哈克深蹲机: 'hack-squat',
  '腿举机（45度倒蹬机）': 'leg-press',
  '腿弯举机（坐姿或俯卧式）': 'leg-curl',
  史密斯机: 'smith-machine',
  哑铃: 'dumbbell',
  哑铃一只: 'dumbbell',
  哑铃一对: 'dumbbell',
  小哑铃一对: 'dumbbell',
  杠铃: 'barbell',
  EZ曲杆: 'ez-bar',
  '哑铃+平板凳': ['dumbbell', 'flat-bench'],
  '哑铃一对+平板卧推凳': ['dumbbell', 'flat-bench'],
  '平板凳+哑铃（可选）': 'flat-bench',
  '可调角度卧推凳+哑铃一对': ['dumbbell', 'incline-bench'],
  '带靠背的凳+哑铃一对': ['dumbbell', 'incline-bench'],
  '史密斯机+平板凳': ['smith-machine', 'flat-bench'],
  '卧推架+杠铃': ['bench-press-rack', 'barbell'],
  '深蹲架+杠铃': ['squat-rack', 'barbell'],
  '高位钢索机+绳把': 'cable-crossover',
  '高位钢索机+直杆': 'cable-crossover',
};

/** 归一化 equipmentId（单个或数组）为 id 数组；空 = 无器械要求/写不清 */
export function toEquipmentIdList(equipmentId: string | string[] | undefined): string[] {
  if (!equipmentId) return [];
  return Array.isArray(equipmentId) ? equipmentId : [equipmentId];
}

/**
 * 动作所需器械 id 列表：优先 exercises.json 补的 equipmentId，
 * 缺省再按 equipment.name 查映射表；都写不清 → 空数组（保守"都有"）。
 */
export function exerciseEquipmentIds(ex: Exercise): string[] {
  const direct = toEquipmentIdList(ex.equipmentId);
  if (direct.length > 0) return direct;
  const byName = ex.equipment?.name ? EQUIPMENT_NAME_TO_ID[ex.equipment.name] : undefined;
  return toEquipmentIdList(byName);
}

/**
 * 动作在当前自有器械下是否可做。
 * @param owned undefined/null = 没设置过 → 全都有；否则为目录 id 清单
 */
export function exerciseAvailableWith(ex: Exercise, owned: string[] | null | undefined): boolean {
  if (owned == null) return true;
  const needs = exerciseEquipmentIds(ex);
  if (needs.length === 0) return true; // 写不清/自重居家类：保守放行
  return needs.every((id) => owned.includes(id));
}

/** 一组动作在 owned 下全部可做（冒烟"零缺器械动作"断言用） */
export function allExercisesAvailable(list: Exercise[], owned: string[] | null | undefined): boolean {
  return list.every((e) => exerciseAvailableWith(e, owned));
}
