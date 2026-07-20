/**
 * 每日训练提醒（本地通知，Capacitor Local Notifications）
 *
 * 契约（与设置页共享，勿改字段名）：
 *   settings.notifyOn   开关，默认 false
 *   settings.notifyTime 'HH:mm'，默认 '18:00'
 *
 * 行为：
 *   - 原生端：scheduleDailyReminder 排一条每天定时的本地通知
 *     （标题「口袋私教」，正文「今天该练了，别回家，去健身房 💪」）
 *   - 网页端（isNative()=false）：全部静默 no-op，不报错不打扰
 *   - syncReminder() 在 App 启动时把通知状态对齐 settings（开→排/改，关→撤）
 *
 * 插件按需动态 import（对齐 tts.ts 模式）：网页端打包/运行都不会触达原生模块。
 */

import { getSettings } from './store';

/** 是否在 Capacitor 原生壳内（照抄 tts.ts 的检测方式） */
function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

/** 固定通知 id：每天一条，重排时先撤旧的，避免重复堆积 */
const REMINDER_ID = 1001;

const REMINDER_TITLE = '口袋私教';
const REMINDER_BODY = '今天该练了，别回家，去健身房 💪';

export const DEFAULT_NOTIFY_TIME = '18:00';

/** 'HH:mm' → { hour, minute }，解析失败回落 18:00 */
function parseTime(time: string | undefined): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!m) return { hour: 18, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute };
}

/**
 * 排每天定时提醒。time 为 'HH:mm'（缺省/非法按 18:00）。
 * 权限未授予时尝试申请；用户拒绝则静默放弃（不打扰）。
 */
export async function scheduleDailyReminder(time: string = DEFAULT_NOTIFY_TIME): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => undefined);
    const { hour, minute } = parseTime(time);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          schedule: {
            every: 'day',
            on: { hour, minute },
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch (e) {
    console.warn('[notify] schedule failed:', e);
  }
}

/** 撤掉每日提醒（幂等，网页端 no-op） */
export async function cancelReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch (e) {
    console.warn('[notify] cancel failed:', e);
  }
}

/**
 * 启动时对齐：settings.notifyOn=true → 按 notifyTime 重排；否则撤销。
 * App.tsx 根部 effect 调用一次即可；设置页改完 notifyOn/notifyTime 也可再调。
 */
export function syncReminder(): void {
  if (!isNative()) return;
  const s = getSettings();
  if (s.notifyOn) {
    void scheduleDailyReminder(s.notifyTime ?? DEFAULT_NOTIFY_TIME);
  } else {
    void cancelReminder();
  }
}
