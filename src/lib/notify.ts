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

/* ================= v1.5：休息计时双保险 + 提醒自检 ================= */

/** 休息结束系统通知 id（与每日提醒 1001 分开） */
const REST_ALARM_ID = 2002;

/**
 * 休息计时双保险：overlay 打开时预约一条 seconds 秒后的系统通知。
 * App 切后台/被杀，系统闹钟照样响（国产 ROM 需过省电白名单，自检页有引导）。
 * 前台正常走完/跳过/离开时会 cancelRestAlarm() 撤掉，不会重复吵。
 */
export async function scheduleRestAlarm(seconds: number, label: string): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return; // 没权限不打扰，前台计时照常
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALARM_ID }] }).catch(() => undefined);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_ALARM_ID,
          title: '休息结束',
          body: `该上了：${label}`,
          schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
        },
      ],
    });
  } catch (e) {
    console.warn('[notify] rest alarm failed:', e);
  }
}

/** 撤掉休息结束通知（前台走完/跳过/卸载时调，幂等） */
export async function cancelRestAlarm(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALARM_ID }] });
  } catch {
    /* ignore */
  }
}

/** 自检用：立刻发一条测试通知，返回是否成功（验证手机到底放不放行） */
export async function sendTestNotification(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return false;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 2999,
          title: '口袋私教 · 测试通知',
          body: '能看到我，说明通知是通的 💪',
          schedule: { at: new Date(Date.now() + 1500) },
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn('[notify] test failed:', e);
    return false;
  }
}

/** 自检用：通知权限 + 精确闹钟（安卓 12+）状态 */
export async function getNotifyStatus(): Promise<{
  native: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
  exactAlarm: 'granted' | 'denied' | 'unknown';
}> {
  if (!isNative()) return { native: false, permission: 'unknown', exactAlarm: 'unknown' };
  let permission: 'granted' | 'denied' | 'prompt' | 'unknown' = 'unknown';
  let exactAlarm: 'granted' | 'denied' | 'unknown' = 'unknown';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    permission = perm.display === 'granted' ? 'granted' : perm.display === 'denied' ? 'denied' : 'prompt';
    try {
      const exact = await (
        LocalNotifications as unknown as {
          checkExactNotificationSetting?: () => Promise<{ exact_alarm?: string }>;
        }
      ).checkExactNotificationSetting?.();
      if (exact?.exact_alarm) exactAlarm = exact.exact_alarm === 'granted' ? 'granted' : 'denied';
    } catch {
      /* 老系统无此概念 */
    }
  } catch (e) {
    console.warn('[notify] status failed:', e);
  }
  return { native: true, permission, exactAlarm };
}

/** 自检用：跳系统"精确闹钟"设置页（安卓 12+；不支持时静默） */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await (
      LocalNotifications as unknown as { changeExactNotificationSetting?: () => Promise<void> }
    ).changeExactNotificationSetting?.();
  } catch {
    /* ignore */
  }
}
