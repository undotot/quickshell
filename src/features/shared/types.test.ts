import { describe, expect, it } from 'vitest';
import { defaultCommands, defaultSettings } from './types';

describe('QuickShell 默认配置', () => {
  it('包含 Git Bash 命令入口', () => {
    expect(defaultCommands.some((command) => command.shellId === 'git-bash')).toBe(true);
  });

  it('使用轻量的终端默认配置', () => {
    expect(defaultSettings.theme).toBe('dark');
    expect(defaultSettings.fontSize).toBeGreaterThanOrEqual(8);
    expect(defaultSettings.scrollback).toBeGreaterThan(0);
  });
});
