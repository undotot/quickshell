import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandRuntimeStore } from './commandRuntimeStore';

const { loadCommandRuntimeValues, saveCommandRuntimeValues } = vi.hoisted(() => ({
  loadCommandRuntimeValues: vi.fn(),
  saveCommandRuntimeValues: vi.fn(),
}));

vi.mock('../shared/tauri', () => ({
  loadCommandRuntimeValues: (...args: unknown[]) => loadCommandRuntimeValues(...args),
  saveCommandRuntimeValues: (...args: unknown[]) => saveCommandRuntimeValues(...args),
}));

describe('commandRuntimeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCommandRuntimeValues.mockResolvedValue(undefined);
  });

  it(' remembers the last committed input value for the next run', async () => {
    // 第一次运行：无历史，初值为空
    loadCommandRuntimeValues.mockResolvedValue({});
    const firstRun = new CommandRuntimeStore();
    expect(await firstRun.getInitialValues('deploy', ['ext'])).toEqual({ ext: '' });

    // 用户输入 42 并成功启动
    await firstRun.commit('deploy', { ext: '42' });
    expect(saveCommandRuntimeValues).toHaveBeenCalledWith({ deploy: { ext: '42' } });

    // 第二次运行（含重启应用：从磁盘重新加载）：预填上次输入
    loadCommandRuntimeValues.mockResolvedValue({ deploy: { ext: '42' } });
    const secondRun = new CommandRuntimeStore();
    expect(await secondRun.getInitialValues('deploy', ['ext'])).toEqual({ ext: '42' });
  });

  it('keeps other commands values when committing one command', async () => {
    loadCommandRuntimeValues.mockResolvedValue({ other: { env: 'prod' } });
    const store = new CommandRuntimeStore();
    await store.commit('deploy', { ext: '7' });

    expect(saveCommandRuntimeValues).toHaveBeenCalledWith({
      other: { env: 'prod' },
      deploy: { ext: '7' },
    });
  });

  it('input mode tolerates load failures and still commits', async () => {
    loadCommandRuntimeValues.mockRejectedValue(new Error('disk error'));
    const store = new CommandRuntimeStore();
    expect(await store.getInitialValues('deploy', ['ext'])).toEqual({ ext: '' });

    await store.commit('deploy', { ext: '9' });
    expect(saveCommandRuntimeValues).toHaveBeenCalledWith({ deploy: { ext: '9' } });
  });

  it('increment counter defaults to start and advances by step', async () => {
    loadCommandRuntimeValues.mockResolvedValue({});
    const firstRun = new CommandRuntimeStore();
    const extension = { mode: 'increment' as const, start: 100, step: 2 };

    expect(await firstRun.getExtensionCounter('deploy', extension)).toBe('100');
    await firstRun.advanceExtensionCounter('deploy', extension);
    expect(saveCommandRuntimeValues).toHaveBeenCalledWith({ deploy: { ext: '102' } });

    // 下次运行读到推进后的计数
    loadCommandRuntimeValues.mockResolvedValue({ deploy: { ext: '102' } });
    const secondRun = new CommandRuntimeStore();
    expect(await secondRun.getExtensionCounter('deploy', extension)).toBe('102');
  });

  it('repairs a corrupted counter with the configured start', async () => {
    loadCommandRuntimeValues.mockResolvedValue({ deploy: { ext: 'oops' } });
    const store = new CommandRuntimeStore();
    expect(
      await store.getExtensionCounter('deploy', { mode: 'increment', start: 5, step: 1 }),
    ).toBe('5');
  });
});
