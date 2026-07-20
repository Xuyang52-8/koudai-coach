/**
 * 打卡分享图（练后总结页「分享今日战绩」）
 *
 * Canvas 直出 1080×1440 竖图 PNG：
 *   黑底 #0A0A0B · 薄荷绿 #3FE1B1 · Oswald 大数字
 *   第几课 / 时长 / 约X大卡 / streak N天 + 日期 + 一句拽文案（随机三选一）+「口袋私教」水印
 *
 * 分享链路：
 *   - 原生端：dataURL → Filesystem 写缓存文件 → @capacitor/share 分享图片文件
 *   - 网页端：降级为新窗口打开图片（长按/右键保存）
 * 全部动态 import 原生插件，网页端零触达；任何一步失败返回 false，调用方静默即可。
 */

export interface ShareCardData {
  /** 第几课（1-4） */
  lessonNumber: number;
  /** 实际用时（分钟），null 表示无记录（补进入总结页时） */
  minutes: number | null;
  /** 估算消耗大卡 */
  kcal: number;
  /** 连续打卡天数 */
  streak: number;
  /** YYYY-MM-DD（缺省今天） */
  date?: string;
}

const W = 1080;
const H = 1440;
const BG = '#0A0A0B';
const ACCENT = '#3FE1B1';
const INK = '#FAFAF8';
const DIM = '#8A8A93';

/** 拽文案池：随机三选一 */
const SLOGANS = [
  '健身房最靓的仔今天也打卡了',
  '汗水不会骗人，今天又赢一次',
  '别人躺平我上分，就这么简单',
] as const;

/** 是否在 Capacitor 原生壳内（照抄 tts.ts 的检测方式） */
function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

const FONT_DISPLAY = "'Oswald','PingFang SC','Hiragino Sans GB','Noto Sans SC','Microsoft YaHei',sans-serif";

/** 尽量等 Oswald 就绪（@font-face 在 index.html 内联，通常已加载） */
async function ensureFonts(): Promise<void> {
  try {
    await Promise.race([
      (async () => {
        await document.fonts.load(`700 100px Oswald`);
        await document.fonts.load(`600 60px Oswald`);
        await document.fonts.ready;
      })(),
      new Promise((r) => setTimeout(r, 800)),
    ]);
  } catch {
    /* 字体不可用就回落 sans-serif，照画 */
  }
}

function fmtDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** 画一组「大数字 + 单位 + 小标签」统计列 */
function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  unit: string,
  label: string,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  ctx.font = `600 116px ${FONT_DISPLAY}`;
  ctx.fillText(value, x, y);
  const w = ctx.measureText(value).width;
  ctx.fillStyle = INK;
  ctx.font = `500 40px ${FONT_DISPLAY}`;
  ctx.fillText(unit, x + w + 12, y);
  ctx.fillStyle = DIM;
  ctx.font = `400 32px ${FONT_DISPLAY}`;
  ctx.fillText(label, x, y + 56);
}

/** 渲染分享图，返回 PNG dataURL（1080×1440） */
export async function renderShareCard(data: ShareCardData): Promise<string> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');

  const date = data.date ?? new Date().toISOString().slice(0, 10);
  const slogan = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];

  /* 底 */
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  /* 顶部薄荷绿粗线 + 品牌行 */
  ctx.fillStyle = ACCENT;
  ctx.fillRect(80, 96, 120, 10);
  ctx.fillStyle = DIM;
  ctx.font = `500 34px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('口袋私教 · 今日打卡', 80, 170);
  ctx.textAlign = 'right';
  ctx.fillText(fmtDate(date), W - 80, 170);

  /* 主角：第 X 课（Oswald 超大数字） */
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `500 64px ${FONT_DISPLAY}`;
  ctx.fillText('第', 80, 470);
  const ziW = ctx.measureText('第').width;
  ctx.fillStyle = ACCENT;
  ctx.font = `700 400px ${FONT_DISPLAY}`;
  ctx.fillText(String(data.lessonNumber), 80 + ziW + 30, 640);
  const numW = ctx.measureText(String(data.lessonNumber)).width;
  ctx.fillStyle = INK;
  ctx.font = `500 64px ${FONT_DISPLAY}`;
  ctx.fillText('课', 80 + ziW + 30 + numW + 30, 470);

  ctx.fillStyle = DIM;
  ctx.font = `400 36px ${FONT_DISPLAY}`;
  ctx.fillText('这节课，拿下。', 80, 740);

  /* 分隔线 */
  ctx.fillStyle = '#26262B';
  ctx.fillRect(80, 820, W - 160, 2);

  /* 三项统计：时长 / 约X大卡 / streak */
  const statY = 950;
  drawStat(ctx, 80, statY, data.minutes !== null ? String(data.minutes) : '—', '分钟', '实际用时');
  drawStat(ctx, 440, statY, String(data.kcal), '大卡', '约消耗');
  drawStat(ctx, 800, statY, String(data.streak), '天', '连续打卡');

  /* 拽文案 */
  ctx.fillStyle = INK;
  ctx.font = `500 46px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText(`「${slogan}」`, W / 2, 1180);

  /* 底部水印 */
  ctx.fillStyle = ACCENT;
  ctx.font = `700 44px ${FONT_DISPLAY}`;
  ctx.fillText('口袋私教', W / 2, 1320);
  ctx.fillStyle = DIM;
  ctx.font = `400 28px ${FONT_DISPLAY}`;
  ctx.fillText('KOUDAI COACH · 健身房里跟着走就行的私教', W / 2, 1370);

  return canvas.toDataURL('image/png');
}

/** 网页端降级：新窗口打开图片，长按/右键保存 */
function openInNewWindow(dataUrl: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  try {
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>今日战绩 · 口袋私教</title>` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>body{margin:0;background:${BG};display:flex;flex-direction:column;align-items:center;min-height:100vh}` +
        `img{width:100%;max-width:540px;height:auto;display:block}` +
        `p{color:${DIM};font:14px/1.6 sans-serif;text-align:center;padding:12px 20px}</style></head>` +
        `<body><img src="${dataUrl}" alt="口袋私教今日打卡图"><p>长按图片保存，去朋友圈炫一张</p></body></html>`,
    );
    win.document.close();
    return true;
  } catch {
    return false;
  }
}

/** 原生端：写缓存文件 → 系统分享 */
async function shareNative(dataUrl: string): Promise<boolean> {
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return false;
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const fileName = `koudai-share-${Date.now()}.png`;
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: '口袋私教 · 今日战绩',
      text: '今天也练完了，战绩在此',
      url: written.uri,
      dialogTitle: '分享今日战绩',
    });
    return true;
  } catch (e) {
    console.warn('[share] native share failed:', e);
    return false;
  }
}

/**
 * 分享今日战绩：原生端走系统分享（图片文件），网页端新窗口打开图（长按保存）。
 * @returns 是否成功发起分享（原生插件 reject/渲染失败才 false）
 */
export async function shareWorkoutCard(data: ShareCardData): Promise<boolean> {
  try {
    const dataUrl = await renderShareCard(data);
    if (isNative()) return await shareNative(dataUrl);
    return openInNewWindow(dataUrl);
  } catch (e) {
    console.warn('[share] render/share failed:', e);
    return false;
  }
}
