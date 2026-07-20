/**
 * 「高级」组 AI 配置面板：DeepSeek Key（测试连通 + 保存）+ 视觉端点三件套（OpenAI 兼容）。
 * 从 Settings.tsx 搬出，让设置页主文件瘦身；交互与视觉与原 §2 完全一致。
 */
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { JSX } from 'react';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { vibrate } from '@/components/feedback';
import { Field } from '@/components/library/inputs';
import Tag, { WarnTag } from '@/components/Tag';
import { testDeepSeekKey } from '@/lib/ai';
import { updateSettings, useSettings } from '@/lib/store';
import { Caption, Panel, PanelRow } from './common';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

/** 眼睛切换（共享 Icon 库无 eye，内联 SVG 补齐） */
function EyeIcon({ off = false, size = 20 }: { off?: boolean; size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** 700ms 旋转 spinner */
function Spinner(): JSX.Element {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
      style={{ display: 'inline-flex' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    </motion.span>
  );
}

const eyeBtnStyle = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-3)',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
} as const;

export function AiConfigPanels({ toast }: { toast: (text: string) => void }): JSX.Element {
  const [settings] = useSettings();

  /* ---- DeepSeek ---- */
  const [dsDraft, setDsDraft] = useState(settings.deepseekKey);
  const [dsShow, setDsShow] = useState(false);
  const [dsTest, setDsTest] = useState<TestState>('idle');
  const [dsError, setDsError] = useState('');
  const [dsFlash, setDsFlash] = useState(false);

  /* ---- 视觉端点 ---- */
  const [vEndpoint, setVEndpoint] = useState(settings.visionEndpoint);
  const [vKey, setVKey] = useState(settings.visionKey);
  const [vModel, setVModel] = useState(settings.visionModel);
  const [vShow, setVShow] = useState(false);
  const [vFlash, setVFlash] = useState(false);

  const flashInput = (set: (v: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 600);
  };

  const saveDeepSeekKey = () => {
    updateSettings({ deepseekKey: dsDraft.trim() });
    flashInput(setDsFlash);
    vibrate(15);
    toast(dsDraft.trim() ? 'Key 已存在本地' : 'Key 已清除');
  };

  const runDeepSeekTest = async () => {
    const key = dsDraft.trim() || settings.deepseekKey;
    if (!key) {
      setDsTest('fail');
      setDsError('先填 Key 再测');
      return;
    }
    setDsTest('testing');
    setDsError('');
    const res = await testDeepSeekKey(key);
    if (res.ok) {
      setDsTest('ok');
      setTimeout(() => setDsTest('idle'), 2000);
    } else {
      setDsTest('fail');
      setDsError(res.error ?? '没通，检查 Key 和网络');
    }
  };

  const saveVision = () => {
    updateSettings({
      visionEndpoint: vEndpoint.trim(),
      visionKey: vKey.trim(),
      visionModel: vModel.trim(),
    });
    flashInput(setVFlash);
    vibrate(15);
    toast('视觉端点已保存');
  };

  const maskedSaved = settings.deepseekKey
    ? `${settings.deepseekKey.slice(0, 3)}····${settings.deepseekKey.slice(-4)}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* DeepSeek */}
      <Panel>
        <PanelRow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>DeepSeek API Key</span>
            {settings.deepseekKey ? <Tag>已配置</Tag> : <WarnTag>未配置</WarnTag>}
          </div>
          <Caption>用于口述记饮食的智能估算，Key 只存在你手机本地</Caption>
        </PanelRow>
        <PanelRow>
          <Field
            type={dsShow ? 'text' : 'password'}
            value={dsDraft}
            onChange={setDsDraft}
            placeholder="sk-..."
            flash={dsFlash}
            right={
              <button
                type="button"
                aria-label={dsShow ? '隐藏 Key' : '显示 Key'}
                onClick={() => setDsShow((s) => !s)}
                style={eyeBtnStyle}
              >
                <EyeIcon off={dsShow} />
              </button>
            }
          />
          {maskedSaved ? <Caption>已保存：{maskedSaved}</Caption> : null}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <GhostButton
              size="sm"
              onClick={runDeepSeekTest}
              disabled={dsTest === 'testing'}
              icon={dsTest === 'testing' ? <Spinner /> : undefined}
              style={
                dsTest === 'ok'
                  ? { borderColor: 'var(--accent)', color: 'var(--accent-ink)' }
                  : dsTest === 'fail'
                    ? { borderColor: 'var(--danger)', color: 'var(--danger)' }
                    : undefined
              }
            >
              {dsTest === 'testing' ? '测试中' : dsTest === 'ok' ? '通了 ✓' : '测试连通'}
            </GhostButton>
            <PrimaryButton size="sm" onClick={saveDeepSeekKey}>
              保存
            </PrimaryButton>
          </div>
          {dsTest === 'fail' && dsError ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>没通：{dsError}</p>
          ) : null}
        </PanelRow>
        <PanelRow last>
          <Caption>
            Key 只存在你手机本地（localStorage），浏览器直连 api.deepseek.com，不经过任何中间服务器。
          </Caption>
          <a
            href="https://platform.deepseek.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-2"
            style={{ display: 'inline-block', marginTop: 6, fontSize: 13, color: 'var(--accent-ink)', textDecoration: 'none' }}
          >
            没有 Key？去 platform.deepseek.com 注册 ↗
          </a>
        </PanelRow>
      </Panel>

      {/* 视觉端点 */}
      <Panel>
        <PanelRow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>拍照识热量（视觉端点）</span>
            {settings.visionEndpoint && settings.visionKey && settings.visionModel ? <Tag>已配置</Tag> : <WarnTag>未配置</WarnTag>}
          </div>
          <Caption>用于拍照识热量，支持任何 OpenAI 兼容视觉 API（智谱 GLM-4V / 通义 Qwen-VL 等）</Caption>
        </PanelRow>
        <PanelRow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field
              label="接口地址 Base URL"
              value={vEndpoint}
              onChange={setVEndpoint}
              placeholder="https://open.bigmodel.cn/api/paas/v4"
              inputMode="url"
              flash={vFlash}
            />
            <Field
              label="API Key"
              type={vShow ? 'text' : 'password'}
              value={vKey}
              onChange={setVKey}
              placeholder="视觉服务的 Key"
              flash={vFlash}
              right={
                <button
                  type="button"
                  aria-label={vShow ? '隐藏 Key' : '显示 Key'}
                  onClick={() => setVShow((s) => !s)}
                  style={eyeBtnStyle}
                >
                  <EyeIcon off={vShow} />
                </button>
              }
            />
            <Field label="模型名" value={vModel} onChange={setVModel} placeholder="glm-4v-flash / qwen-vl-max …" flash={vFlash} />
            <PrimaryButton size="sm" onClick={saveVision}>
              保存视觉配置
            </PrimaryButton>
          </div>
        </PanelRow>
        <PanelRow last>
          <Caption>随便哪家 OpenAI 兼容的多模态服务都行，填了就能在饮食页拍照估算。</Caption>
        </PanelRow>
      </Panel>
    </div>
  );
}
