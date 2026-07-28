/**
 * 「更新了什么」（v1.7）：每次版本更新后首次打开，在首页弹一张新功能导览卡。
 * 解决"更新了但找不到更新在哪"的老大难——看见才会用。
 */
import { readKey, writeKey } from './store';

/** 当前版本号（与 android versionName 同步手动维护） */
export const APP_VERSION = '1.7.0';

const SEEN_KEY = 'whatsnewSeen';

/** 每个版本的新功能导览：新加版本时在头部插一条 */
const WHATS_NEW: Record<string, { title: string; items: { what: string; where: string }[] }> = {
  '1.7.0': {
    title: 'v1.7 首页大改版',
    items: [
      { what: '首页按使用频率重排：热量差、快捷入口、小练在最前', where: '就在本页，往下翻' },
      { what: '激活码：App 需要邀请码才能用，把码分享给朋友即可推广', where: '首次打开时输入' },
      { what: '桌面小组件（2×4）：热量差和今日训练抬眼可见，三主题跟随 App', where: '长按桌面 → 小组件 → 口袋私教' },
    ],
  },
  '1.6.0': {
    title: 'v1.6 新功能',
    items: [
      { what: '今日热量差大环 + 体重打卡 + 体重趋势线', where: '首页顶部 / 成长页' },
      { what: '凯格尔三模式 + 大圆环倒计时', where: '日常小练' },
      { what: '久坐提醒 + 每周战报 + 羊皮纸主题', where: '设置页' },
      { what: '10 个动作 AI 分解图', where: '动作详情页' },
    ],
  },
};

/** 返回本次启动需要展示的版本导览（已看过返回 null） */
export function pendingWhatsNew(): { title: string; items: { what: string; where: string }[] } | null {
  const seen = readKey<string>(SEEN_KEY, '');
  if (seen === APP_VERSION) return null;
  const entry = WHATS_NEW[APP_VERSION];
  return entry ?? null;
}

/** 标记当前版本已读 */
export function markWhatsNewSeen(): void {
  writeKey(SEEN_KEY, APP_VERSION);
}
