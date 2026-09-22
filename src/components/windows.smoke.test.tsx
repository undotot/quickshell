// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { CommandPalette } from './CommandPalette';
import { CommandParametersDialog } from './CommandParametersDialog';
import { SettingsWindow } from './ShortcutSettingsPopover';
import type { CommandProfile } from '../features/shared/types';

// React 18+ 要求显式声明这是 act 环境
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const mount = (node: ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<ThemeProvider>{node}</ThemeProvider>);
  });
  return container;
};

/** 冲掉 store 初始化的 microtask，让回退数据渲染出来。 */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const text = (element: HTMLElement) => element.textContent ?? '';

const clickButton = (scope: HTMLElement, label: string) => {
  const button = Array.from(scope.querySelectorAll('button')).find((item) =>
    (item.textContent ?? '').trim().startsWith(label),
  );
  if (!button) throw new Error(`未找到按钮：${label}`);
  act(() => {
    button.click();
  });
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('无法设置输入值');
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('命令面板冒烟测试', () => {
  beforeEach(() => {
    // jsdom 未实现 scrollIntoView，选中项滚动会用到
    Element.prototype.scrollIntoView = () => undefined;
    window.localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('运行模式挂载后展示搜索栏与回退命令', async () => {
    const view = mount(<CommandPalette />);
    await flush();

    expect(view.querySelector('#palette-input')).toBeTruthy();
    expect(text(view)).toContain('Git 状态');
    expect(text(view)).toContain('3 条命令');
  });

  it('输入未匹配内容时提供直接运行与保存为命令', async () => {
    const view = mount(<CommandPalette />);
    await flush();

    const input = view.querySelector<HTMLInputElement>('#palette-input');
    if (!input) throw new Error('未找到输入框');

    setInputValue(input, 'npm run build');
    expect(text(view)).toContain('直接运行');
    expect(text(view)).toContain('保存为命令');

    setInputValue(input, 'git');
    expect(text(view)).toContain('Git 状态');
    expect(text(view)).not.toContain('保存为命令');
  });

  it('管理模式渲染命令列表与编辑器，修改后出现未保存提示', async () => {
    const view = mount(<CommandPalette />);
    await flush();

    clickButton(view, '管理');

    expect(text(view)).toContain('管理命令');
    expect(text(view)).toContain('编辑命令');
    expect(text(view)).toContain('初始目录');
    expect(view.querySelector('textarea')).toBeTruthy();

    const nameInput = view.querySelector<HTMLInputElement>('input[placeholder="例如：部署固件"]');
    if (!nameInput) throw new Error('未找到名称输入框');
    setInputValue(nameInput, 'Git 状态（改）');

    expect(text(view)).toContain('未保存的修改');

    // 确认弹窗通过 Portal 挂载到 document.body，需要从 body 上查找
    clickButton(view, '返回运行');
    expect(text(document.body)).toContain('放弃未保存的修改');

    clickButton(document.body, '放弃修改');
    expect(text(view)).toContain('Enter 运行');
  });

  it('管理模式可配置扩展参数并插入占位符', async () => {
    const view = mount(<CommandPalette />);
    await flush();

    clickButton(view, '管理');

    expect(text(view)).toContain('扩展参数');

    // 切到自动递增：出现起始值/步长，且提示插入占位符
    clickButton(view, '自动递增');
    expect(text(view)).toContain('起始值');
    expect(text(view)).toContain('步长');
    clickButton(view, '插入到命令');
    const textarea = view.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea?.value).toContain('{{ext}}');

    // 切到每次输入：提示自动带入上次取值
    clickButton(view, '每次输入');
    expect(text(view)).toContain('自动带入上次取值');

    // 切回关闭：配置被清除
    clickButton(view, '关闭');
    expect(text(view)).toContain('可选择数字自动递增');
  });

  it('设置窗口的外观 tab 可切换主题并写入 data-theme', async () => {
    const view = mount(<SettingsWindow />);
    await flush();

    clickButton(view, '外观');
    expect(text(view)).toContain('外观主题');
    expect(text(view)).toContain('主题预览');

    clickButton(view, '深色');
    expect(document.documentElement.dataset.theme).toBe('dark');

    clickButton(view, '浅色');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('quickshell.theme-mode')).toBe('light');
  });

  it('参数弹窗校验必填后携带取值提交', async () => {
    const command: CommandProfile = {
      id: 'deploy',
      name: '部署固件',
      command: 'python deploy.py --build-no {{buildNo}}',
      shellId: 'powershell',
      cwd: '',
      pinned: false,
    };
    const submitted: Record<string, string>[] = [];
    const view = mount(
      <CommandParametersDialog
        open
        command={command}
        initialValues={{ buildNo: '14291' }}
        onSubmit={(values) => submitted.push(values)}
        onCancel={() => undefined}
      />,
    );

    // 弹窗通过 Portal 挂载到 document.body
    expect(text(document.body)).toContain('启动参数');
    expect(text(document.body)).toContain('buildNo');
    // PowerShell 会对裸值加引号
    expect(text(document.body)).toContain('python deploy.py --build-no');

    // 清空后提交被拦截
    const input = document.body.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('未找到参数输入框');
    setInputValue(input, '');
    clickButton(document.body, '启动');
    expect(text(document.body)).toContain('请填写参数');
    expect(submitted).toHaveLength(0);

    setInputValue(input, '31200');
    clickButton(document.body, '启动');
    expect(submitted).toEqual([{ buildNo: '31200' }]);
  });
});
