/**
 * 激活码（v1.7 · 方案A）：离线校验的邀请码，用于分享推广。
 *
 * 码格式：KD-XXXX-XXXX-XX（10 位主体：前 8 位随机载荷 + 后 2 位校验位）
 * 校验算法：FNV-1a 32bit(载荷 + 盐) 取模映射到字母表后两位——
 * 与 scripts/gen-codes.py 严格同构，改一边必须改另一边。
 * 定位：防君子不防极客，足够支撑"分享给朋友才能用"的推广阶段。
 */
import { readKey, writeKey } from './store';

/** 盐：与 scripts/gen-codes.py 的 SALT 保持一致 */
const SALT = 'koudai-coach-license-v1';

/** 字母表（31 个，剔除易混淆的 0/O/1/I/L） */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const LICENSE_KEY = 'licenseCode';

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 校验码（不关心格式细节，容忍大小写/空格/连字符） */
export function validateCode(raw: string): boolean {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 10) return false;
  const payload = code.slice(0, 8);
  const check = code.slice(8);
  for (const ch of payload) if (!ALPHA.includes(ch)) return false;
  const h = fnv1a(payload + SALT);
  const expect = ALPHA[h % 31] + ALPHA[Math.floor(h / 31) % 31];
  return check === expect;
}

/** 已激活？ */
export function isActivated(): boolean {
  const code = readKey<string>(LICENSE_KEY, '');
  return code !== '' && validateCode(code);
}

/** 尝试激活：成功存码返回 true */
export function activate(raw: string): boolean {
  if (!validateCode(raw)) return false;
  writeKey(LICENSE_KEY, raw.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return true;
}
