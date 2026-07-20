/**
 * 《口袋私教》数据备份 / 恢复
 * 备份 = localStorage 里 koudai-coach:* 全部键的 JSON 快照（键名带前缀原样打包）。
 * - exportBackup()：打包下载（设置页「导出我的数据」）
 * - parseBackupText()：逐项校验备份文本，坏文件给人话错误
 * - applyBackup()：快照式覆盖写回（调用方负责随后 reload，store 内存缓存随之重建）
 */

/** localStorage 键空间前缀（与 src/lib/store.ts 一致） */
export const BACKUP_PREFIX = 'koudai-coach:';

/** 备份文件结构：{ 'koudai-coach:cycle': ..., 'koudai-coach:settings': ..., ... } */
export type BackupData = Record<string, unknown>;

export type ParseResult = { ok: true; data: BackupData } | { ok: false; error: string };

/** 结构层面不合法时的统一人话错误 */
export const BAD_BACKUP_MSG = '这不是口袋私教的备份文件';

/* ================= 导出 ================= */

/** 打包 koudai-coach:* 全部键为 JSON 并触发下载 */
export function exportBackup(): void {
  const data: BackupData = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(BACKUP_PREFIX)) continue;
    try {
      data[k] = JSON.parse(localStorage.getItem(k) ?? 'null');
    } catch {
      data[k] = localStorage.getItem(k);
    }
  }
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `koudai-sijiao-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ================= 校验 ================= */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 核心三键：备份里至少得有一个，才可能是本 App 导出的快照 */
const CORE_NAMES = ['cycle', 'settings', 'profile'] as const;

/** koudai-coach:cycle —— 练一休一循环（types.ts CycleState） */
function validCycle(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (typeof v.nextWorkoutIndex !== 'number' || typeof v.streak !== 'number') return false;
  if (!Array.isArray(v.history)) return false;
  return v.history.every(
    (h) => isRecord(h) && typeof h.date === 'string' && typeof h.workoutId === 'string' && typeof h.kcal === 'number',
  );
}

/** koudai-coach:settings —— 老版本就有的必填字段做类型把关 */
function validSettings(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (typeof v.weightKg !== 'number') return false;
  if (typeof v.ttsOn !== 'boolean') return false;
  if (typeof v.deepseekKey !== 'string') return false;
  return true;
}

/** koudai-coach:profile —— 问卷档案（null = 没填过也合法） */
function validProfile(v: unknown): boolean {
  if (v === null) return true;
  if (!isRecord(v)) return false;
  if (typeof v.age !== 'number' || typeof v.heightCm !== 'number' || typeof v.weightKg !== 'number') return false;
  if (!Array.isArray(v.venues)) return false;
  return true;
}

/**
 * 解析 + 逐项校验备份文本。
 * 结构问题（不是 JSON / 不是对象 / 键不带 koudai-coach: 前缀 / 缺核心键）→ BAD_BACKUP_MSG；
 * 核心键数据形状损坏 → 指出具体哪一项坏了。
 */
export function parseBackupText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: BAD_BACKUP_MSG };
  }
  if (!isRecord(raw)) return { ok: false, error: BAD_BACKUP_MSG };
  const entries = Object.entries(raw);
  if (entries.length === 0) return { ok: false, error: BAD_BACKUP_MSG };
  for (const [k] of entries) {
    if (!k.startsWith(BACKUP_PREFIX)) return { ok: false, error: BAD_BACKUP_MSG };
  }
  if (!CORE_NAMES.some((n) => BACKUP_PREFIX + n in raw)) return { ok: false, error: BAD_BACKUP_MSG };
  for (const [k, v] of entries) {
    const name = k.slice(BACKUP_PREFIX.length);
    if (name === 'cycle' && !validCycle(v)) {
      return { ok: false, error: '备份文件里「训练记录」已损坏，换个备份试试' };
    }
    if (name === 'settings' && !validSettings(v)) {
      return { ok: false, error: '备份文件里「设置」已损坏，换个备份试试' };
    }
    if (name === 'profile' && !validProfile(v)) {
      return { ok: false, error: '备份文件里「身体档案」已损坏，换个备份试试' };
    }
  }
  return { ok: true, data: raw };
}

/* ================= 恢复 ================= */

/**
 * 快照式覆盖：先清掉本机现有 koudai-coach:* 键，再按备份逐键写回。
 * 只动 localStorage——调用方随后 reload，store 的内存缓存自然重建。
 */
export function applyBackup(data: BackupData): void {
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) stale.push(k);
  }
  stale.forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(data)) {
    localStorage.setItem(k, JSON.stringify(v));
  }
}
