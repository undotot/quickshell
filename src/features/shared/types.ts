export type ShellId = 'cmd' | 'powershell' | 'pwsh' | 'git-bash' | 'custom';

export interface ShellProfile {
  id: ShellId;
  name: string;
  executable: string;
  args: string[];
  available: boolean;
}

/**
 * 扩展参数：每条命令至多一个，占位符固定为 {{ext}}。
 * - increment：数字递增，每次成功运行后按步长自动前进；
 * - input：每次运行时弹框输入数字/字母，自动带入上次取值。
 */
export type CommandExtensionMode = 'increment' | 'input';

export interface CommandExtension {
  mode: CommandExtensionMode;
  /** increment 模式：首次运行使用的起始值。 */
  start: number;
  /** increment 模式：每次成功运行后的递增步长。 */
  step: number;
}

/**
 * 命令配置只保留快捷运行所需的最小字段。
 * 命令文本中的 {{参数名}} 占位符在运行时提示填写，无需单独的参数配置。
 */
export interface CommandProfile {
  id: string;
  name: string;
  command: string;
  shellId: ShellId;
  cwd: string;
  pinned: boolean;
  extension?: CommandExtension;
}

/** 每条命令上一次运行的参数取值，用于下次启动自动带入。 */
export type CommandRuntimeValues = Record<string, Record<string, string>>;

export interface CommandExecutionResult {
  started: boolean;
  success?: boolean | null;
  exitCode?: number | null;
}

export interface AppSettings {
  /**
   * 主题偏好。运行时以 localStorage 为准（见 features/theme/theme.ts），
   * 这里保留字段是为了与 Rust 侧 AppSettings 结构保持一致。
   */
  theme: ThemeMode;
  globalShortcut: string;
}

/** 主题三态：跟随系统 / 浅色 / 深色。 */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeChangeRequest {
  theme: ThemeMode;
}

export interface ShortcutChangeRequest {
  shortcut: string;
}

export interface ShortcutChangeResult {
  success: boolean;
  shortcut: string;
  message?: string;
}

export const defaultSettings: AppSettings = {
  theme: 'system',
  globalShortcut: 'CommandOrControl+Space',
};

export const defaultCommands: CommandProfile[] = [
  {
    id: 'open-powershell',
    name: 'PowerShell',
    command: '',
    shellId: 'powershell',
    cwd: '',
    pinned: true,
  },
  {
    id: 'git-status',
    name: 'Git 状态',
    command: 'git status',
    shellId: 'git-bash',
    cwd: '',
    pinned: false,
  },
  {
    id: 'open-cmd',
    name: 'CMD',
    command: '',
    shellId: 'cmd',
    cwd: '',
    pinned: false,
  },
];
