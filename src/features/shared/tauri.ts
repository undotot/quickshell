import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import type {
  AppSettings,
  CommandExecutionResult,
  CommandProfile,
  CommandRuntimeValues,
  ShellProfile,
  ShortcutChangeRequest,
  ShortcutChangeResult,
  ThemeChangeRequest,
  ThemeMode,
} from './types';

const childWindows = new Map<string, WebviewWindow>();
let registeredShortcut: string | null = null;

// 快捷键由 Tauri 原生处理器负责显隐；JS 回调仅用于满足动态注册 API 的签名。
const handleGlobalShortcutEvent = (): void => undefined;

export const isDesktopRuntime = (): boolean => '__TAURI_INTERNALS__' in window;

const invokeDesktop = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isDesktopRuntime()) {
    throw new Error('当前页面不在 QuickShell 桌面运行时中。');
  }

  return invoke<T>(command, args);
};

export const detectShells = (): Promise<ShellProfile[]> => invokeDesktop('detect_shells');

export const loadCommandProfiles = (): Promise<CommandProfile[]> =>
  invokeDesktop('load_command_profiles');

export const saveCommandProfiles = (commands: CommandProfile[]): Promise<void> =>
  invokeDesktop('save_command_profiles', { commands });

export const loadCommandRuntimeValues = (): Promise<CommandRuntimeValues> =>
  invokeDesktop('load_command_runtime_values');

export const saveCommandRuntimeValues = (values: CommandRuntimeValues): Promise<void> =>
  invokeDesktop('save_command_runtime_values', { values });

export const notifyCommandsChanged = async (): Promise<void> => {
  if (isDesktopRuntime()) {
    await emitTo('main', 'commands-changed').catch(() => undefined);
  }
};

export const requestGlobalShortcutChange = async (shortcut: string): Promise<void> => {
  if (isDesktopRuntime()) {
    const payload: ShortcutChangeRequest = { shortcut };
    await emitTo('main', 'shortcut-settings-requested', payload);
  }
};

export const notifyShortcutChangeResult = async (result: ShortcutChangeResult): Promise<void> => {
  if (isDesktopRuntime()) {
    await emitTo('settings', 'shortcut-settings-result', result);
  }
};

/** 主题是全局偏好，任一个窗口改动后广播到所有窗口。 */
export const notifyThemeChanged = async (theme: ThemeMode): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const payload: ThemeChangeRequest = { theme };
  await Promise.allSettled([
    emitTo('main', 'theme-changed', payload),
    emitTo('settings', 'theme-changed', payload),
  ]);
};

export const loadAppSettings = (): Promise<AppSettings> => invokeDesktop('load_app_settings');

export const saveAppSettings = (settings: AppSettings): Promise<void> =>
  invokeDesktop('save_app_settings', { settings });

export const showMainWindow = async (): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const window = getCurrentWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
};

export const hideCurrentWindow = async (): Promise<void> => {
  if (!isDesktopRuntime()) return;
  await getCurrentWindow().hide();
};

export const setGlobalShortcut = async (shortcut: string): Promise<void> => {
  if (!isDesktopRuntime()) return;
  if (registeredShortcut === shortcut) return;

  const previousShortcut = registeredShortcut;
  if (previousShortcut) {
    await unregister(previousShortcut);
    registeredShortcut = null;
  }

  try {
    await register(shortcut, handleGlobalShortcutEvent);
    registeredShortcut = shortcut;
  } catch (error) {
    if (previousShortcut) {
      try {
        await register(previousShortcut, handleGlobalShortcutEvent);
        registeredShortcut = previousShortcut;
      } catch {
        registeredShortcut = null;
      }
    }
    throw error;
  }
};

/** 在独立系统控制台中启动命令；QuickShell 不参与控制台输入输出。 */
export const launchShellProcess = (params: {
  shellId: string;
  cwd: string;
  initialCommand: string;
}): Promise<CommandExecutionResult> => invokeDesktop('launch_shell_process', params);

export const closeCurrentWindow = async (): Promise<void> => {
  if (isDesktopRuntime()) {
    await getCurrentWindow().close();
    return;
  }
  window.close();
};

export type SettingsSection = 'shortcut' | 'updates' | 'appearance';

export const openSettingsWindow = async (section: SettingsSection = 'shortcut'): Promise<void> => {
  await openChildWindow('settings', 'QuickShell 设置', `index.html?view=settings&section=${section}`, {
    width: 520,
    height: 600,
    minWidth: 480,
    minHeight: 560,
    resizable: false,
  });
  if (isDesktopRuntime()) {
    await emitTo('settings', 'settings-section-requested', section).catch(() => undefined);
  }
};

async function openChildWindow(
  label: string,
  title: string,
  url: string,
  size: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    resizable: boolean;
  },
): Promise<WebviewWindow> {
  if (!isDesktopRuntime()) {
    throw new Error('子窗口只能在 QuickShell 桌面运行时中打开。');
  }

  const existing = childWindows.get(label);
  if (existing) {
    try {
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      return existing;
    } catch {
      childWindows.delete(label);
    }
  }

  const child = new WebviewWindow(label, {
    url,
    title,
    width: size.width,
    height: size.height,
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    resizable: size.resizable,
    center: true,
    focus: true,
    decorations: false,
  });

  childWindows.set(label, child);
  void child.once('tauri://destroyed', () => {
    childWindows.delete(label);
  });
  void child.once('tauri://error', (event) => {
    console.error(`子窗口 ${title} 创建失败：`, event.payload);
    childWindows.delete(label);
  });

  // 等待窗口真正创建完成，避免连续打开时第二次请求仍然读到“未显示”。
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('子窗口创建超时'));
    }, 5000);
    const resolveCreated = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const rejectCreation = (event: { payload: unknown }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error(String(event.payload)));
    };

    void child.once('tauri://created', resolveCreated);
    void child.once('tauri://error', rejectCreation);
  });

  return child;
}
