import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FolderSync,
  GitBranch,
  Keyboard,
  Pin,
  Play,
  Search,
  Settings,
  ShieldAlert,
  SquareTerminal,
  Terminal,
  RefreshCw,
  ArrowUpCircle,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { CommandStore } from '../features/commands/commandStore';
import { settingsStore } from '../features/settings/settingsStore';
import {
  openCommandManagerWindow,
  openShortcutSettingsWindow,
  openShellWindow,
  notifyShortcutChangeResult,
} from '../features/shared/tauri';
import { updateStore } from '../features/update/updateStore';
import type {
  CommandProfile,
  ShellProfile,
  ShortcutChangeRequest,
} from '../features/shared/types';
import { TitleBar } from './TitleBar';
import { formatShortcut } from './ShortcutSettingsPopover';
import { ConfirmDialog } from './ConfirmDialog';
import { UpdateDialog } from './UpdateDialog';

const commandStore = new CommandStore();

const getCommandIcon = (command: CommandProfile) => {
  if (command.shellId === 'git-bash') return GitBranch;
  if (command.shellId === 'cmd') return SquareTerminal;
  if (command.command.toLowerCase().includes('robocopy')) return FolderSync;
  if (command.command) return Play;
  return Terminal;
};

const getShellDisplayName = (shell: ShellProfile): string => {
  switch (shell.id) {
    case 'powershell':
      return 'PowerShell';
    case 'pwsh':
      return 'PowerShell 7';
    case 'git-bash':
      return 'Git Bash';
    default:
      return shell.name;
  }
};

const getCommandPreview = (command: string): string => {
  return command.replace(/\s+/g, ' ').trim();
};

interface CommandItemProps {
  command: CommandProfile;
  shell?: ShellProfile;
  isActive: boolean;
  onRun: (command: CommandProfile) => void;
  onHover: () => void;
}

const CommandItem = ({ command, shell, isActive, onRun, onHover }: CommandItemProps) => {
  const Icon = getCommandIcon(command);

  return (
    <button
      type="button"
      onClick={() => onRun(command)}
      onMouseEnter={onHover}
      aria-label={`执行 ${command.name}`}
      aria-current={isActive}
      className={`relative flex min-h-[54px] w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        isActive
          ? 'border-primary/40 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-muted/40'
      }`}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1 py-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {command.name}
          </span>
          {command.pinned && <Pin size={12} className="shrink-0 text-primary" />}
          {command.confirmBeforeRun && (
            <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border border-state-warning/25 bg-state-warning/10 px-1 py-0.5 text-[10px] text-state-warning">
              <ShieldAlert size={10} />
              确认
            </span>
          )}
          {shell && (
            <span className="shrink-0 whitespace-nowrap rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {getShellDisplayName(shell)}
            </span>
          )}
          <ChevronRight
            size={14}
            className={`shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
          />
        </span>
        <span
          className={`mt-0.5 block truncate whitespace-nowrap text-[10px] leading-4 ${
            command.command ? 'font-mono text-muted-foreground' : 'text-muted-foreground/80'
          }`}
          title={command.command || '直接打开 Shell'}
        >
          {command.command ? getCommandPreview(command.command) : '直接打开 Shell'}
        </span>
      </span>
    </button>
  );
};

export const MainLauncher = observer(function MainLauncher() {
  const [openError, setOpenError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingCommand, setPendingCommand] = useState<CommandProfile | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleOpenManager = useCallback(async () => {
    setOpenError('');
    try {
      await openCommandManagerWindow();
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : '管理窗口打开失败。');
    }
  }, []);

  const handleOpenShortcutSettings = useCallback(async () => {
    setOpenError('');
    try {
      await openShortcutSettingsWindow();
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : '快捷键设置窗口打开失败。');
    }
  }, []);

  const handleRunCommand = useCallback(async (command: CommandProfile) => {
    setOpenError('');
    if (command.confirmBeforeRun) {
      setPendingCommand(command);
      return;
    }

    try {
      await openShellWindow(command);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : '执行窗口打开失败。');
    }
  }, []);

  const handleCancelRun = useCallback(() => {
    setPendingCommand(null);
  }, []);

  const handleConfirmRun = useCallback(async () => {
    if (!pendingCommand) return;

    const command = pendingCommand;
    setPendingCommand(null);
    try {
      await openShellWindow(command);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : '执行窗口打开失败。');
    }
  }, [pendingCommand]);

  useEffect(() => {
    void Promise.all([commandStore.initialize(), settingsStore.initialize()]);
    if (!('__TAURI_INTERNALS__' in window)) return;

    let disposers: Array<() => void> = [];
    void Promise.all([
      listen('commands-changed', () => {
        void commandStore.reloadCommands();
      }),
      listen('tray-open-manager', () => {
        void handleOpenManager();
      }),
      listen('tray-open-shortcut-settings', () => {
        void handleOpenShortcutSettings();
      }),
      listen('tray-check-updates', () => {
        void updateStore.checkForUpdates(true, true);
      }),
      listen<ShortcutChangeRequest>('shortcut-settings-requested', (event) => {
        const shortcut = event.payload?.shortcut?.trim();
        if (!shortcut) return;

        void settingsStore.updateGlobalShortcut(shortcut).then((success) => {
          void notifyShortcutChangeResult({
            success,
            shortcut: success ? shortcut : settingsStore.settings.globalShortcut,
            message: success ? undefined : settingsStore.errorMessage,
          });
        });
      }),
    ]).then((unlisteners) => {
      disposers = unlisteners;
    });

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [handleOpenManager, handleOpenShortcutSettings]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void updateStore.checkForUpdates();
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, []);

  const shellMap = useMemo(
    () => new Map(commandStore.shells.map((shell) => [shell.id, shell])),
    [commandStore.shells],
  );

  const filteredCommands = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commandStore.visibleCommands;
    return commandStore.visibleCommands.filter(
      (command) =>
        command.name.toLowerCase().includes(keyword) ||
        command.command.toLowerCase().includes(keyword),
    );
  }, [commandStore.visibleCommands, query]);

  const pinnedCommands = filteredCommands.filter((command) => command.pinned);
  const normalCommands = filteredCommands.filter((command) => !command.pinned);
  const availableUpdate =
    updateStore.status === 'available' ? updateStore.pendingUpdate : null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleWindowKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (filteredCommands.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % filteredCommands.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = filteredCommands[Math.min(selectedIndex, filteredCommands.length - 1)];
        if (target) void handleRunCommand(target);
      }
    },
    [filteredCommands, handleRunCommand, selectedIndex],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [handleWindowKeyDown]);

  const renderSection = (commands: CommandProfile[], offset: number) =>
    commands.map((command, index) => (
      <CommandItem
        key={command.id}
        command={command}
        shell={shellMap.get(command.shellId)}
        isActive={offset + index === selectedIndex}
        onRun={(target) => void handleRunCommand(target)}
        onHover={() => setSelectedIndex(offset + index)}
      />
    ));

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <main className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
        <TitleBar subtitle="命令启动器" />

      {/* 搜索区 */}
      <div className="shrink-0 px-2.5 pb-1.5 pt-2.5">
        <label htmlFor="command-search" className="relative flex items-center">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            id="command-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索命令…"
            aria-label="搜索命令"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-14 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/45 focus:outline-none"
          />
          <kbd className="absolute right-2 rounded-[5px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] leading-4 text-muted-foreground">
            Ctrl K
          </kbd>
        </label>
      </div>

      {availableUpdate && (
        <button
          type="button"
          onClick={() => void updateStore.installUpdate()}
          aria-label={`更新到版本 ${availableUpdate.version}`}
          className="mx-2.5 mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-left transition-colors hover:border-primary/55 hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="pulse-dot" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <ArrowUpCircle size={13} />
              <span>发现新版本 {availableUpdate.version}</span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {availableUpdate.body || '点击立即下载并安装更新'}
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            立即更新
          </span>
        </button>
      )}

      {/* 命令列表（主滚动区） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5 pt-0.5">
        {commandStore.isLoading ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            正在加载命令…
          </div>
        ) : filteredCommands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
            {commandStore.commands.length === 0 ? (
              <>
                暂无命令
                <br />
                点击下方「管理命令」创建第一条命令
              </>
            ) : (
              '没有匹配的命令'
            )}
          </div>
        ) : (
          <>
            {pinnedCommands.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  已固定
                </p>
                <div className="space-y-1">{renderSection(pinnedCommands, 0)}</div>
              </>
            )}
            {normalCommands.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  命令
                </p>
                <div className="space-y-1">{renderSection(normalCommands, pinnedCommands.length)}</div>
              </>
            )}
          </>
        )}

        {(openError || commandStore.errorMessage || settingsStore.errorMessage) && (
          <p className="mt-3 rounded-xl border border-state-error/20 bg-state-error/10 px-3 py-2 text-[11px] leading-5 text-state-error">
            {openError || commandStore.errorMessage || settingsStore.errorMessage}
          </p>
        )}
      </div>

      {/* 底部状态栏 */}
      <footer className="flex shrink-0 items-center justify-between gap-1 border-t border-border bg-card/60 px-1.5 py-1.5 text-[11px]">
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
            {formatShortcut(settingsStore.settings.globalShortcut)
              .split(' + ')
              .map((part) => (
                <kbd
                  key={part}
                  className="shrink-0 whitespace-nowrap rounded-[5px] border border-border bg-muted px-1 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
                >
                  {part}
                </kbd>
              ))}
          </span>
          <span className="shrink-0 whitespace-nowrap">唤起</span>
          {updateStore.noticeMessage && (
            <span
              role="status"
              aria-live="polite"
              className="max-w-[108px] truncate rounded-md bg-state-success/10 px-1.5 py-1 text-[10px] text-state-success"
            >
              {updateStore.noticeMessage}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void updateStore.checkForUpdates(true, true)}
            disabled={updateStore.status === 'checking' || updateStore.status === 'installing'}
            aria-label="检查更新"
            title={updateStore.status === 'error' ? updateStore.errorMessage : '检查更新'}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RefreshCw
              size={12}
              className={updateStore.status === 'checking' ? 'animate-spin' : undefined}
            />
            <span className="sr-only">
              {updateStore.status === 'checking' ? '检查中' : '检查更新'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handleOpenShortcutSettings()}
            aria-label="快捷键设置"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Keyboard size={12} />
            快捷键设置
          </button>
          <button
            type="button"
            onClick={() => void handleOpenManager()}
            aria-label="管理命令"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Settings size={12} />
            管理命令
          </button>
        </div>
      </footer>
      </main>
      <ConfirmDialog
        open={pendingCommand !== null}
        title="确认执行命令？"
        description={pendingCommand ? `即将执行“${pendingCommand.name}”，是否继续？` : ''}
        commandText={pendingCommand?.command.trim() || '直接打开 Shell'}
        onConfirm={() => void handleConfirmRun()}
        onCancel={handleCancelRun}
      />
      <UpdateDialog />
    </div>
  );
});
