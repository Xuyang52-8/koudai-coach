/**
 * PageStub：未实现页面的临时占位（ScreenHeader + EmptyState）。
 * 页面代理实现各自页面时直接替换对应 pages/*.tsx 文件即可。
 */
import type { JSX } from 'react';
import EmptyState from './EmptyState';
import ScreenHeader from './ScreenHeader';

export interface PageStubProps {
  label: string;
  title: string;
  hint?: string;
}

export function PageStub({ label, title, hint = '这个页面正在装配中，先把今天该练的练了。' }: PageStubProps): JSX.Element {
  return (
    <div>
      <ScreenHeader label={label} title={title} />
      <EmptyState text={hint} />
    </div>
  );
}

export default PageStub;
