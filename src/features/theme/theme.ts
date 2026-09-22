/**
 * 主题（皮肤）核心逻辑
 *
 * 三态模型：
 * - system：跟随 Windows 浅色 / 深色设置（默认）
 * - light ：始终使用浅色
 * - dark  ：始终使用深色
 *
 * 为什么用 localStorage 而不是落盘的 AppSettings：
 * 1. localStorage 同步读取，首屏渲染前即可确定主题，浅色用户不会看到深色闪屏；
 * 2. Tauri 各窗口共享同一 WebView2 数据目录，localStorage 天然跨窗口可见；
 * 3. 避免设置尚未从磁盘加载完成时写回、把其它字段（字号等）覆盖成默认值。
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'quickshell.theme-mode';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

export const readStoredThemeMode = (): ThemeMode => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    // 隐私模式等场景下 localStorage 不可用，回退到默认值
    return 'system';
  }
};

export const storeThemeMode = (mode: ThemeMode): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 写入失败不影响当前会话的主题表现
  }
};

export const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY).matches : false;

export const resolveTheme = (mode: ThemeMode): ResolvedTheme =>
  mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;

/** 把解析后的主题写到 <html data-theme>，CSS 令牌据此切换。 */
export const applyTheme = (mode: ThemeMode): ResolvedTheme => {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  return resolved;
};

/** 首屏渲染前同步应用主题，返回当前模式。 */
export const bootstrapTheme = (): ThemeMode => {
  const mode = readStoredThemeMode();
  applyTheme(mode);
  return mode;
};

/** 订阅系统配色变化，返回取消订阅函数。 */
export const watchSystemTheme = (onChange: () => void): (() => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
