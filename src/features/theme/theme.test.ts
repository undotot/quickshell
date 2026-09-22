// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  isThemeMode,
  readStoredThemeMode,
  resolveTheme,
  storeThemeMode,
} from './theme';

const stubSystemTheme = (prefersDark: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

describe('主题三态（system / light / dark）', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isThemeMode 只接受三个合法值', () => {
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('DARK')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });

  it('显式模式不跟随系统配色', () => {
    stubSystemTheme(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('system 模式跟随系统配色', () => {
    stubSystemTheme(true);
    expect(resolveTheme('system')).toBe('dark');

    stubSystemTheme(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('默认 system，非法存储值也回退 system', () => {
    expect(readStoredThemeMode()).toBe('system');

    window.localStorage.setItem('quickshell.theme-mode', 'neon');
    expect(readStoredThemeMode()).toBe('system');
  });

  it('applyTheme 写入 data-theme 供 CSS 令牌切换', () => {
    stubSystemTheme(false);

    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    expect(applyTheme('system')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('storeThemeMode 写入后可被读回', () => {
    storeThemeMode('light');
    expect(readStoredThemeMode()).toBe('light');
  });
});
