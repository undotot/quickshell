import { describe, expect, it } from 'vitest';
import { defaultCommands, defaultSettings } from './types';

describe('QuickShell 默认配置', () => {
  it('包含 Git Bash 命令入口', () => {
    expect(defaultCommands.some((command) => command.shellId === 'git-bash')).toBe(true);
  });

  it('使用跟随系统的默认主题与默认快捷键', () => {
    expect(defaultSettings.theme).toBe('system');
    expect(defaultSettings.globalShortcut).toBe('CommandOrControl+Space');
  });

  it('命令配置只保留快捷运行所需字段', () => {
    for (const command of defaultCommands) {
      expect(Object.keys(command).sort()).toEqual(['command', 'cwd', 'id', 'name', 'pinned', 'shellId']);
    }
  });
});
