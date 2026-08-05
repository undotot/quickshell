import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import type {
  AppSettings,
  CommandProfile,
  ShellProfile,
  ShortcutChangeRequest,
  ShortcutChangeResult,
} from './types';

const childWindows = new Map<string, WebviewWindow>();
let registeredShortcut: string | null = null;

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

export const notifyCommandsChanged = async (): Promise<void> => {
  if (isDesktopRuntime()) {
    await emitTo('main', 'commands-changed');
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
    await emitTo('shortcut-settings', 'shortcut-settings-result', result);
  }
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

export const toggleMainWindow = async (): Promise<void> => {
  if (!isDesktopRuntime()) return;
  const window = getCurrentWindow();
  const isVisible = await window.isVisible();
  const isMinimized = await window.isMinimized();
  if (isVisible && !isMinimized) {
    await window.hide();
    return;
  }
  await showMainWindow();
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
    await register(shortcut, (event) => {
      if (event.state === 'Pressed') {
        void toggleMainWindow();
      }
    });
    registeredShortcut = shortcut;
  } catch (error) {
    if (previousShortcut) {
      try {
        await register(previousShortcut, (event) => {
          if (event.state === 'Pressed') {
            void toggleMainWindow();
          }
        });
        registeredShortcut = previousShortcut;
      } catch {
        registeredShortcut = null;
      }
    }
    throw error;
  }
};

export const launchShellProcess = (params: {
  shellId: string;
  cwd: string;
  initialCommand: string;
}): Promise<void> => invokeDesktop('launch_shell_process', params);

export const closeCurrentWindow = async (): Promise<void> => {
  if (isDesktopRuntime()) {
    await getCurrentWindow().close();
    return;
  }
  window.close();
};

export const openCommandManagerWindow = async (): Promise<void> => {
  await openChildWindow('command-manager', '管理命令', 'index.html?view=manager', {
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 460,
    resizable: true,
  });
};

export const openShortcutSettingsWindow = async (): Promise<void> => {
  await openChildWindow('shortcut-settings', '快捷键设置', 'index.html?view=shortcut-settings', {
    width: 380,
    height: 460,
    minWidth: 340,
    minHeight: 380,
    resizable: false,
  });
};

export const openShellWindow = async (command: CommandProfile): Promise<void> => {
  await launchShellProcess({
    shellId: command.shellId,
    cwd: command.cwd,
    initialCommand: command.command,
  });
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

  return child;
}
