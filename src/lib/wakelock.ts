/**
 * 屏幕常亮（Screen Wake Lock）：训练页挂载且 settings.keepScreenOn 时请求 screen 锁。
 * 系统在页面隐藏时自动释放锁，故 visibilitychange 回到可见时重新获取。
 * 不支持的环境（旧浏览器/非安全上下文）静默降级，不报错。
 */
import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * @param active 是否持有屏幕锁（Workout 页传 settings.keepScreenOn）
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = (): void => {
      try {
        nav.wakeLock
          ?.request('screen')
          .then((s) => {
            // 请求途中开关已关/组件已卸载：立刻还回去
            if (disposed) {
              s.release().catch(() => {});
              return;
            }
            sentinel = s;
          })
          .catch(() => {
            /* 低电量/权限拒绝等：静默降级 */
          });
      } catch {
        /* ignore */
      }
    };

    acquire();
    const onVis = (): void => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      try {
        sentinel?.release().catch(() => {});
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}
