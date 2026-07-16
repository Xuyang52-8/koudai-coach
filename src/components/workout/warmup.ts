/**
 * 热身参数卡：把热身动作数据转成"隔一米也看得清"的三个大数字。
 * 跑步机 → 坡度12 / 速度4 / 5分钟；椭圆机 → 阻力3-5档 / 匀速 / 5分钟。
 */
import type { Exercise } from '../../lib/types';

export interface WarmupParam {
  /** 大数字（Oswald 40px accent），如 "12"、"3-5" */
  value: string;
  /** 下方单位 caption，如 "坡度" */
  unit: string;
}

export interface WarmupSpec {
  /** display 大标题，如 "去跑步机" */
  title: string;
  /** 三个大数字参数 */
  params: [WarmupParam, WarmupParam, WarmupParam];
  /** 预习页摘要行，如 "跑步机 · 坡度12 · 速度4 · 5分钟" */
  summary: string;
  /** 备选 caption */
  fallback: string;
  /** 热身时长（秒），计时器用 */
  durationSec: number;
}

export function warmupSpec(warmup: Exercise | null): WarmupSpec {
  const name = warmup?.equipment.name ?? '跑步机';
  const durationSec = 5 * 60;
  if (/椭圆机/.test(name)) {
    return {
      title: '去椭圆机',
      params: [
        { value: '3-5', unit: '阻力档' },
        { value: '匀速', unit: '踩 5 分钟' },
        { value: '5', unit: '分钟' },
      ],
      summary: '椭圆机 · 阻力3-5档 · 匀速 · 5分钟',
      fallback: '椭圆机满了？跑步机坡度走也行，5 分钟微微出汗就算数。',
      durationSec,
    };
  }
  return {
    title: '去跑步机',
    params: [
      { value: '12', unit: '坡度' },
      { value: '4', unit: '速度 km/h' },
      { value: '5', unit: '分钟' },
    ],
    summary: '跑步机 · 坡度12 · 速度4 · 5分钟',
    fallback: '跑步机满了？椭圆机/划船机也行，踩 5 分钟微微出汗就算数。',
    durationSec,
  };
}
