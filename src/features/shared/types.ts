export type ShellId = 'cmd' | 'powershell' | 'pwsh' | 'git-bash' | 'custom';

export interface ShellProfile {
  id: ShellId;
  name: string;
  executable: string;
  args: string[];
  available: boolean;
}

export interface CommandProfile {
  id: string;
  name: string;
  command: string;
  shellId: ShellId;
  cwd: string;
  pinned: boolean;
  confirmBeforeRun: boolean;
}

export interface AppSettings {
  fontSize: number;
  scrollback: number;
  theme: 'dark' | 'light';
  globalShortcut: string;
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
  fontSize: 14,
  scrollback: 5000,
  theme: 'dark',
  globalShortcut: 'CommandOrControl+Shift+Space',
};

export const defaultCommands: CommandProfile[] = [
  {
    id: 'open-powershell',
    name: 'PowerShell',
    command: '',
    shellId: 'powershell',
    cwd: '',
    pinned: true,
    confirmBeforeRun: false,
  },
  {
    id: 'git-status',
    name: 'Git 状态',
    command: 'git status',
    shellId: 'git-bash',
    cwd: '',
    pinned: false,
    confirmBeforeRun: false,
  },
  {
    id: 'open-cmd',
    name: 'CMD',
    command: '',
    shellId: 'cmd',
    cwd: '',
    pinned: false,
    confirmBeforeRun: false,
  },
];
