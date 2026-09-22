import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { listen } from '@tauri-apps/api/event';
import { notifyThemeChanged } from '../shared/tauri';
import type { ThemeChangeRequest, ThemeMode } from '../shared/types';
import {
  applyTheme,
  isThemeMode,
  readStoredThemeMode,
  storeThemeMode,
  watchSystemTheme,
  type ResolvedTheme,
} from './theme';

interface ThemeContextValue {
  /** 用户选择：system / light / dark */
  mode: ThemeMode;
  /** 实际生效的主题：light / dark */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readAppliedTheme = (): ResolvedTheme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredThemeMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(readAppliedTheme);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const setMode = useCallback((next: ThemeMode) => {
    modeRef.current = next;
    setModeState(next);
    setResolved(applyTheme(next));
    storeThemeMode(next);
    // 其它窗口（快速搜索、设置）需要同步换肤
    void notifyThemeChanged(next);
  }, []);

  // 系统配色变化时，仅 system 模式需要跟随
  useEffect(
    () =>
      watchSystemTheme(() => {
        if (modeRef.current !== 'system') return;
        setResolved(applyTheme('system'));
      }),
    [],
  );

  // 任一窗口改动主题后，其余窗口被动同步
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    let dispose: (() => void) | undefined;
    void listen<ThemeChangeRequest>('theme-changed', (event) => {
      const next = event.payload?.theme;
      if (!isThemeMode(next) || next === modeRef.current) return;
      modeRef.current = next;
      setModeState(next);
      setResolved(applyTheme(next));
      storeThemeMode(next);
    }).then((unlisten) => {
      dispose = unlisten;
    });

    return () => dispose?.();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme 必须在 ThemeProvider 内部使用。');
  return context;
};
