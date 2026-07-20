/**
 * 「高级」组数据面板：
 * - BackupPanel 数据备份：导出 JSON + 导入恢复（选文件 → backup.ts 逐项校验 → 输入「恢复」二字二次确认 → 覆盖写回 → reload）
 * - DangerPanel 重置/清空：清空 koudai-coach:*（输入「清空」二字确认，原有交互不变）
 * 校验与写回逻辑集中在 @/lib/backup，这里只管交互。
 */
import { useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { DangerButton, GhostButton } from '@/components/Buttons';
import { vibrate } from '@/components/feedback';
import Icon from '@/components/Icon';
import { Field } from '@/components/library/inputs';
import { BAD_BACKUP_MSG, applyBackup, exportBackup, parseBackupText } from '@/lib/backup';
import type { BackupData } from '@/lib/backup';
import { Caption, Panel, PanelRow } from './common';

/** localStorage 键空间前缀（与 src/lib/store.ts 一致） */
const LS_PREFIX = 'koudai-coach:';

/* ================= 数据备份（导出 / 导入恢复） ================= */

export function BackupPanel({ toast }: { toast: (text: string) => void }): JSX.Element {
  const [exported, setExported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [pending, setPending] = useState<BackupData | null>(null);
  const [restoreSheetOpen, setRestoreSheetOpen] = useState(false);
  const [restoreText, setRestoreText] = useState('');

  const doExport = () => {
    exportBackup();
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  /** 选文件 → 读文本 → 校验；通过则进二次确认弹层，不通过给行内人话错误 */
  const onFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重选同一个文件
    if (!file) return;
    setImportError('');
    file
      .text()
      .then((text) => {
        const res = parseBackupText(text);
        if (!res.ok) {
          setImportError(res.error);
          vibrate([50, 50, 50]);
          return;
        }
        setPending(res.data);
        setRestoreText('');
        setRestoreSheetOpen(true);
      })
      .catch(() => setImportError(BAD_BACKUP_MSG));
  };

  /** 确认恢复：覆盖写回 → toast → reload（store 内存缓存随重载重建） */
  const confirmRestore = () => {
    if (!pending) return;
    try {
      applyBackup(pending);
    } catch {
      setRestoreSheetOpen(false);
      setImportError('写入失败，手机存储空间可能不够');
      return;
    }
    setRestoreSheetOpen(false);
    vibrate([50, 50, 50]);
    toast('已恢复，正在重启');
    setTimeout(() => window.location.reload(), 1100);
  };

  return (
    <>
      <Panel>
        <PanelRow last>
          <div style={{ display: 'flex', gap: 10 }}>
            <GhostButton
              fullWidth={false}
              icon={exported ? <Icon name="check" size={18} /> : <Icon name="export" size={18} />}
              onClick={doExport}
              style={{ flex: 1, ...(exported ? { borderColor: 'var(--accent)', color: 'var(--accent-ink)' } : {}) }}
            >
              {exported ? '已导出 ✓' : '导出备份'}
            </GhostButton>
            <GhostButton
              fullWidth={false}
              icon={
                <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }} aria-hidden="true">
                  <Icon name="export" size={18} />
                </span>
              }
              onClick={() => fileRef.current?.click()}
              style={{ flex: 1 }}
            >
              导入恢复
            </GhostButton>
          </div>
          <Caption>训练记录 / 饮食 / 体重 / 补剂打卡，打包成 JSON。换手机时选「导入恢复」，一键搬回来。</Caption>
          {importError ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)', lineHeight: 1.5 }}>{importError}</p>
          ) : null}
        </PanelRow>
      </Panel>

      {/* 隐藏文件选择器：只吃本 App 导出的 .json */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFilePicked}
      />

      {/* 恢复二次确认：输入「恢复」二字，防汗手误触（与清空确认同风格） */}
      <BottomSheet open={restoreSheetOpen} onClose={() => setRestoreSheetOpen(false)} title="导入恢复">
        <h3 className="text-1" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          覆盖恢复？
        </h3>
        <p className="text-2" style={{ margin: '10px 0 16px', fontSize: 15, lineHeight: 1.6 }}>
          将覆盖当前所有记录，不可撤销。建议先「导出备份」留一手。在下方输入「恢复」两个字确认。
        </p>
        <Field value={restoreText} onChange={setRestoreText} placeholder='输入"恢复"确认' />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <DangerButton
            disabled={restoreText !== '恢复'}
            icon={<Icon name="check" size={18} />}
            onClick={confirmRestore}
            style={{ transition: 'opacity 200ms, background 200ms' }}
          >
            我确定，覆盖恢复
          </DangerButton>
          <GhostButton
            onClick={() => {
              setRestoreSheetOpen(false);
              setRestoreText('');
            }}
          >
            再想想
          </GhostButton>
        </div>
      </BottomSheet>
    </>
  );
}

/* ================= 重置 / 清空 ================= */

export function DangerPanel(): JSX.Element {
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [clearText, setClearText] = useState('');

  const clearAll = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    vibrate([50, 50, 50]);
    // 整页重载：清空 store 内存缓存，回到首屏初始态
    window.location.href = '/';
  };

  return (
    <>
      <Panel>
        <PanelRow last>
          <DangerButton icon={<Icon name="trash" size={18} />} onClick={() => setClearSheetOpen(true)}>
            清空所有数据
          </DangerButton>
          <Caption>只清本 App 的数据（koudai-coach:*），不影响其他站点。</Caption>
        </PanelRow>
      </Panel>

      {/* 清空确认：输入「清空」二字（原有交互不变） */}
      <BottomSheet open={clearSheetOpen} onClose={() => setClearSheetOpen(false)} title="清空确认">
        <h3 className="text-1" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          全清？
        </h3>
        <p className="text-2" style={{ margin: '10px 0 16px', fontSize: 15, lineHeight: 1.6 }}>
          训练记录、饮食记录、API Key、自建动作全部删除，不可恢复。在下方输入「清空」两个字确认。
        </p>
        <Field value={clearText} onChange={setClearText} placeholder='输入"清空"确认' />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <DangerButton
            disabled={clearText !== '清空'}
            icon={<Icon name="trash" size={18} />}
            onClick={clearAll}
            style={{ transition: 'opacity 200ms, background 200ms' }}
          >
            我确定，全部删掉
          </DangerButton>
          <GhostButton
            onClick={() => {
              setClearSheetOpen(false);
              setClearText('');
            }}
          >
            再想想
          </GhostButton>
        </div>
      </BottomSheet>
    </>
  );
}
