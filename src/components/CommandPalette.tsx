import { observer } from 'mobx-react-lite';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ArrowLeft,
  GitBranch,
  Pin,
  Play,
  Plus,
  Search,
  Settings,
  SquarePen,
  SquareTerminal,
  Terminal,
  X,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CommandStore } from '../features/commands/commandStore';
import { settingsStore } from '../features/settings/settingsStore';
import { useCommandRunner } from '../features/commands/useCommandRunner';
import type { CommandExtension, CommandProfile, ShellProfile } from '../features/shared/types';
import { EXTENSION_TOKEN } from '../features/commands/commandTemplate';
import {
  hideCurrentWindow,
  isDesktopRuntime,
  notifyShortcutChangeResult,
  openSettingsWindow,
  type SettingsSection,
} from '../features/shared/tauri';
import type { ShortcutChangeRequest } from '../features/shared/types';
import { CommandParametersDialog } from './CommandParametersDialog';
import { ConfirmDialog } from './ConfirmDialog';

const commandStore = new CommandStore();

const createCommandId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getCommandIcon = (command: CommandProfile) => {
  if (command.shellId === 'git-bash') return GitBranch;
  if (command.shellId === 'cmd') return SquareTerminal;
  return Terminal;
};

const getShellDisplayName = (shell?: ShellProfile): string => {
  if (!shell) return 'Shell';
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

const normalizeCommand = (command: string): string => command.replace(/\s+/g, ' ').trim();

/** 扩展参数的模式选项；none 表示未启用。 */
const EXTENSION_OPTIONS = [
  { mode: 'none', label: '关闭' },
  { mode: 'increment', label: '自动递增' },
  { mode: 'input', label: '每次输入' },
] as const;
type ExtensionOptionMode = (typeof EXTENSION_OPTIONS)[number]['mode'];

const scoreCommand = (command: CommandProfile, keyword: string): number => {
  const name = command.name.toLowerCase();
  const content = command.command.toLowerCase();
  if (name === keyword) return 0;
  if (name.startsWith(keyword)) return 1;
  if (name.includes(keyword)) return 2;
  if (content.startsWith(keyword)) return 3;
  return 4;
};

type ResultItem =
  | { kind: 'command'; command: CommandProfile }
  | { kind: 'run-raw' }
  | { kind: 'save-raw' };

/**
 * QuickShell 唯一的快捷输入界面：
 * - 运行模式：一个输入框既是命令搜索框，也是临时命令行（无匹配时可直接运行或一键保存）；
 * - 管理模式：同一窗口内完成新建 / 编辑 / 删除，无需切换到其它窗口。
 */
export const CommandPalette = observer(function CommandPalette() {
  const [mode, setMode] = useState<'run' | 'manage'>('run');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Record<string, HTMLElement | null>>({});
  const commandTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusStateRef = useRef<'activating' | 'focused'>('activating');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const handleCommandSuccess = useCallback(() => hideCurrentWindow(), []);
  const {
    pendingParameterCommand,
    pendingParameterKeys,
    parameterValues,
    runCommand,
    executeCommand,
    handleParameterSubmit,
    cancelParameters,
  } = useCommandRunner({ onError: setErrorMessage, onSuccess: handleCommandSuccess });

  /* ------------------------------ 管理模式状态 ------------------------------ */

  const [editorCommand, setEditorCommand] = useState<CommandProfile | null>(null);
  const [isNewCommand, setIsNewCommand] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const originalRef = useRef<CommandProfile | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommandProfile | null>(null);
  const [showManageHint, setShowManageHint] = useState(
    () => window.localStorage.getItem('quickshell.manage-hint-dismissed') !== '1',
  );

  const isDirty = useMemo(
    () =>
      editorCommand !== null &&
      JSON.stringify(editorCommand) !== JSON.stringify(originalRef.current),
    [editorCommand],
  );

  const defaultShellId = useMemo(() => {
    const available = commandStore.availableShells;
    return (available.find((shell) => shell.id === 'powershell') ?? available[0])?.id ?? 'powershell';
  }, [commandStore.availableShells]);

  /* -------------------------------- 焦点与激活 ------------------------------- */

  const focusSearch = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    setErrorMessage('');
    setNotice('');
    requestAnimationFrame(() => {
      if (modeRef.current === 'run') {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    });
  }, []);

  /** 丢弃编辑状态并回到运行模式；每次唤起面板时调用。 */
  const resetToRunMode = useCallback(() => {
    setMode('run');
    setEditorCommand(null);
    originalRef.current = null;
    setEditorError('');
    setPendingDiscard(null);
  }, []);

  // 托盘“管理命令”等外部入口通过 ref 调用最新的 enterManageMode，避免监听器闭包过期。
  const openManageRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    void commandStore.initialize();
    void settingsStore.initialize(true);
    if (!isDesktopRuntime()) return;

    let disposers: Array<() => void> = [];
    let disposeFocus: (() => void) | undefined;
    let blurTimer: number | undefined;
    let activationTimer: number | undefined;
    const currentWindow = getCurrentWindow();

    const activatePalette = () => {
      focusStateRef.current = 'activating';
      focusSearch();

      if (activationTimer !== undefined) window.clearTimeout(activationTimer);
      activationTimer = window.setTimeout(() => {
        void currentWindow
          .isFocused()
          .then((focused) => {
            if (focused) focusStateRef.current = 'focused';
          })
          .catch(() => undefined);
      }, 180);
    };

    activatePalette();

    void Promise.all([
      listen('palette-activated', () => {
        void commandStore.reloadCommands();
        // 每次唤起都回到运行模式，避免上次停留在管理模式造成困扰。
        resetToRunMode();
        activatePalette();
      }),
      listen('palette-manage-requested', () => {
        void commandStore.reloadCommands();
        openManageRef.current();
      }),
      listen('commands-changed', () => {
        void commandStore.reloadCommands();
      }),
      listen('tray-open-settings', () => {
        void openSettingsWindow('shortcut').catch(() => undefined);
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

    void currentWindow
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          focusStateRef.current = 'focused';
          if (blurTimer !== undefined) {
            window.clearTimeout(blurTimer);
            blurTimer = undefined;
          }
          return;
        }

        // 窗口创建或重新显示期间可能先发出瞬时失焦事件。
        // 只有确认窗口真正获得过焦点后，失焦才代表用户离开了命令面板。
        if (focusStateRef.current !== 'focused') return;
        if (blurTimer !== undefined) window.clearTimeout(blurTimer);
        blurTimer = window.setTimeout(() => {
          // 管理模式下正在编辑，不因失焦自动隐藏。
          if (modeRef.current !== 'run') return;
          void Promise.all([currentWindow.isVisible(), currentWindow.isFocused()])
            .then(([visible, focusedNow]) => {
              if (visible && !focusedNow) void hideCurrentWindow();
            })
            .catch(() => undefined);
        }, 80);
      })
      .then((unlisten) => {
        disposeFocus = unlisten;
      });

    return () => {
      disposers.forEach((dispose) => dispose());
      disposeFocus?.();
      if (blurTimer !== undefined) window.clearTimeout(blurTimer);
      if (activationTimer !== undefined) window.clearTimeout(activationTimer);
    };
  }, [focusSearch, resetToRunMode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* -------------------------------- 运行模式 -------------------------------- */

  const shellMap = useMemo(
    () => new Map(commandStore.shells.map((shell) => [shell.id, shell])),
    [commandStore.shells],
  );

  const filteredCommands = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commandStore.visibleCommands;

    return [...commandStore.visibleCommands]
      .filter(
        (command) =>
          command.name.toLowerCase().includes(keyword) ||
          command.command.toLowerCase().includes(keyword),
      )
      .sort((left, right) => scoreCommand(left, keyword) - scoreCommand(right, keyword));
  }, [commandStore.visibleCommands, query]);

  // 输入没有匹配任何已保存命令时，把输入框当作临时命令行：
  // 可以直接运行，也可以一键保存为命令。
  const showRawActions = query.trim().length > 0 && filteredCommands.length === 0;

  const resultItems = useMemo<ResultItem[]>(() => {
    const items: ResultItem[] = filteredCommands.map((command) => ({ kind: 'command', command }));
    if (showRawActions) {
      items.push({ kind: 'run-raw' }, { kind: 'save-raw' });
    }
    return items;
  }, [filteredCommands, showRawActions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const selected = resultItems[selectedIndex];
    if (!selected || selected.kind !== 'command') return;
    resultRefs.current[selected.command.id]?.scrollIntoView({ block: 'nearest' });
  }, [resultItems, selectedIndex]);

  const runRawCommand = useCallback(() => {
    const rawCommand = query.trim();
    if (!rawCommand) return;
    void executeCommand({
      id: '',
      name: '临时命令',
      command: rawCommand,
      shellId: defaultShellId,
      cwd: '',
      pinned: false,
    });
  }, [defaultShellId, executeCommand, query]);

  const saveRawCommand = useCallback(async () => {
    const rawCommand = query.trim();
    if (!rawCommand) return;

    const name = rawCommand.length > 80 ? `${rawCommand.slice(0, 80)}…` : rawCommand;
    const saved = await commandStore.save({
      id: createCommandId(),
      name,
      command: rawCommand,
      shellId: defaultShellId,
      cwd: '',
      pinned: false,
    });
    if (saved) {
      setQuery('');
      setNotice(`已保存“${name}”`);
    }
  }, [defaultShellId, query]);

  const activateResultItem = useCallback(
    (item: ResultItem | undefined) => {
      if (!item) return;
      if (item.kind === 'command') {
        void runCommand(item.command);
        return;
      }
      if (item.kind === 'run-raw') {
        runRawCommand();
        return;
      }
      void saveRawCommand();
    },
    [runCommand, runRawCommand, saveRawCommand],
  );

  /* -------------------------------- 管理模式 -------------------------------- */

  const openEditor = useCallback(
    (command: CommandProfile | null) => {
      const proceed = () => {
        setEditorError('');
        if (command) {
          setEditorCommand({ ...command });
          originalRef.current = { ...command };
          setIsNewCommand(false);
        } else {
          setEditorCommand({
            id: createCommandId(),
            name: '',
            command: '',
            shellId: defaultShellId,
            cwd: '',
            pinned: false,
          });
          originalRef.current = null;
          setIsNewCommand(true);
        }
      };

      if (isDirty) {
        setPendingDiscard(proceed);
        return;
      }
      proceed();
    },
    [defaultShellId, isDirty],
  );

  const exitManageMode = useCallback(() => {
    const proceed = () => {
      setEditorCommand(null);
      originalRef.current = null;
      setMode('run');
      requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    if (isDirty) {
      setPendingDiscard(proceed);
      return;
    }
    proceed();
  }, [isDirty]);

  const enterManageMode = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    setMode('manage');
    const first = commandStore.visibleCommands[0] ?? null;
    openEditor(first);
  }, [openEditor]);
  openManageRef.current = enterManageMode;

  const dismissManageHint = useCallback(() => {
    window.localStorage.setItem('quickshell.manage-hint-dismissed', '1');
    setShowManageHint(false);
  }, []);

  const setEditorExtension = useCallback((extension: CommandExtension | undefined) => {
    setEditorCommand((current) => (current ? { ...current, extension } : current));
  }, []);

  const setExtensionOption = useCallback(
    (mode: ExtensionOptionMode) => {
      setEditorCommand((current) => {
        if (!current) return current;
        if (mode === 'none') return { ...current, extension: undefined };
        return {
          ...current,
          extension: {
            mode,
            start: current.extension?.start ?? 1,
            step: current.extension?.step ?? 1,
          },
        };
      });
    },
    [],
  );

  const updateExtensionStart = useCallback((raw: string) => {
    setEditorCommand((current) => {
      if (!current?.extension) return current;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isSafeInteger(parsed) || parsed < 0) return current;
      return { ...current, extension: { ...current.extension, start: parsed } };
    });
  }, []);

  const updateExtensionStep = useCallback((raw: string) => {
    setEditorCommand((current) => {
      if (!current?.extension) return current;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isSafeInteger(parsed) || parsed < 1) return current;
      return { ...current, extension: { ...current.extension, step: parsed } };
    });
  }, []);

  /** 把 {{ext}} 插到命令文本光标处（无光标信息时追加到末尾）。 */
  const insertExtensionToken = useCallback(() => {
    const element = commandTextareaRef.current;
    setEditorCommand((current) => {
      if (!current || current.command.includes(EXTENSION_TOKEN)) return current;
      const text = current.command;
      const start = element?.selectionStart ?? text.length;
      const end = element?.selectionEnd ?? start;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const padBefore = before && !/\s$/.test(before) ? ' ' : '';
      const padAfter = after && !/^\s/.test(after) ? ' ' : '';
      return { ...current, command: `${before}${padBefore}${EXTENSION_TOKEN}${padAfter}${after}` };
    });
    requestAnimationFrame(() => element?.focus());
  }, []);

  const handleSaveEditor = useCallback(async () => {
    if (!editorCommand || isSaving) return;

    const name = editorCommand.name.trim();
    if (!name) {
      setEditorError('请填写命令名称。');
      return;
    }
    if (editorCommand.extension?.mode === 'increment') {
      if (!Number.isSafeInteger(editorCommand.extension.start) || editorCommand.extension.start < 0) {
        setEditorError('扩展参数的起始值必须是非负整数。');
        return;
      }
      if (!Number.isSafeInteger(editorCommand.extension.step) || editorCommand.extension.step < 1) {
        setEditorError('扩展参数的递增步长必须是正整数。');
        return;
      }
    }

    setIsSaving(true);
    const saved = { ...editorCommand, name };
    const success = await commandStore.save(saved);
    setIsSaving(false);
    if (success) {
      setEditorCommand(saved);
      originalRef.current = { ...saved };
      setIsNewCommand(false);
      setEditorError('');
      setNotice(`已保存“${saved.name}”`);
    }
  }, [editorCommand, isSaving]);

  const handleDeleteEditor = useCallback(async () => {
    if (!deleteTarget) return;
    const success = await commandStore.remove(deleteTarget.id);
    setDeleteTarget(null);
    if (success && editorCommand?.id === deleteTarget.id) {
      setEditorCommand(null);
      originalRef.current = null;
    }
  }, [deleteTarget, editorCommand]);

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void handleSaveEditor();
      return;
    }
    if (event.key === 'Escape' && event.target === event.currentTarget) {
      event.preventDefault();
      exitManageMode();
    }
  };

  /* -------------------------------- 键盘导航 -------------------------------- */

  const handleRunModeKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (pendingParameterCommand) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      void hideCurrentWindow();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      enterManageMode();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (resultItems.length > 0) {
        setSelectedIndex((index) => (index + 1) % resultItems.length);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (resultItems.length > 0) {
        setSelectedIndex((index) => (index - 1 + resultItems.length) % resultItems.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateResultItem(resultItems[selectedIndex]);
    }
  };

  const handleGlobalKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'manage' || pendingDiscard || deleteTarget) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exitManageMode();
    }
  };

  const displayError = editorError || commandStore.errorMessage || errorMessage;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-window text-foreground">
      <main
        className="flex h-full w-full flex-col overflow-hidden bg-window"
        onKeyDown={handleGlobalKeyDown}
      >
        <header
          data-tauri-drag-region
          className="flex h-9 shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5"
        >
          <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <Terminal size={13} strokeWidth={2} />
            </span>
            <span className="truncate text-[12px] font-semibold">QuickShell</span>
            {mode === 'manage' && (
              <span className="truncate text-[10px] text-muted-foreground">· 管理命令</span>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              data-no-drag
              onClick={() => (mode === 'run' ? enterManageMode() : exitManageMode())}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-chip hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {mode === 'run' ? <SquarePen size={12} /> : <ArrowLeft size={12} />}
              {mode === 'run' ? '管理' : '返回运行'}
            </button>
            <button
              type="button"
              data-no-drag
              onClick={() => void openSettingsWindow('shortcut').catch((error) => {
                setErrorMessage(error instanceof Error ? error.message : '设置窗口打开失败。');
              })}
              aria-label="设置"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-chip hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Settings size={13} />
            </button>
            <button
              type="button"
              data-no-drag
              onClick={() => void hideCurrentWindow()}
              aria-label="隐藏窗口"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-error/15 hover:text-state-error focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {mode === 'run' ? (
          <>
            <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-border px-4">
              <Search size={19} className="shrink-0 text-primary" aria-hidden="true" />
              <input
                ref={searchInputRef}
                id="palette-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleRunModeKeyDown}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder="搜索命令，或直接输入命令…"
                aria-label="搜索或输入命令"
                className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-subtle"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="清空输入"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-chip hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd className="shrink-0 rounded-md border border-border bg-chip px-1.5 py-1 font-mono text-[10px] text-subtle">
                  Esc
                </kbd>
              )}
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
              {showManageHint && query === '' && !commandStore.isLoading && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary-soft px-3 py-2">
                  <SquarePen size={13} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
                    按 Ctrl + E 或点底部「管理命令」，可新增 / 编辑 / 删除命令
                  </span>
                  <button
                    type="button"
                    onClick={dismissManageHint}
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    知道了
                  </button>
                </div>
              )}
              {commandStore.isLoading ? (
                <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                  正在加载命令…
                </div>
              ) : resultItems.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[12px] text-muted-foreground">
                    暂无命令，输入命令文本可直接运行
                  </p>
                  <button
                    type="button"
                    onClick={enterManageMode}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Plus size={13} />
                    新建命令
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {resultItems.map((item, index) => {
                    const isSelected = index === selectedIndex;

                    if (item.kind === 'command') {
                      const command = item.command;
                      const Icon = getCommandIcon(command);
                      const shell = shellMap.get(command.shellId);
                      const commandText = normalizeCommand(command.command) || '直接打开 Shell';

                      return (
                        <button
                          key={command.id}
                          ref={(element) => {
                            resultRefs.current[command.id] = element;
                          }}
                          type="button"
                          aria-selected={isSelected}
                          title={`${command.name} · ${getShellDisplayName(shell)}`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => activateResultItem(item)}
                          className={`flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                            isSelected ? 'bg-primary text-on-primary' : 'hover:bg-chip'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              isSelected ? 'bg-on-primary/15' : 'bg-chip text-muted-foreground'
                            }`}
                          >
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                                {command.name}
                              </span>
                              {command.pinned && (
                                <Pin size={12} className="shrink-0" aria-label="已固定" />
                              )}
                            </span>
                            <span
                              className={`mt-0.5 block truncate font-mono text-[11px] ${
                                isSelected ? 'text-on-primary/70' : 'text-muted-foreground'
                              }`}
                            >
                              {commandText}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[11px] ${
                              isSelected ? 'text-on-primary/70' : 'text-subtle'
                            }`}
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                        </button>
                      );
                    }

                    const isRunRaw = item.kind === 'run-raw';
                    const rawText = normalizeCommand(query);
                    return (
                      <button
                        key={isRunRaw ? 'run-raw' : 'save-raw'}
                        type="button"
                        aria-selected={isSelected}
                        title={rawText}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => activateResultItem(item)}
                        className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                          isSelected ? 'bg-primary text-on-primary' : 'hover:bg-chip'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isSelected ? 'bg-on-primary/15' : 'bg-chip text-muted-foreground'
                          }`}
                        >
                          {isRunRaw ? <Play size={15} /> : <Plus size={15} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">
                            {isRunRaw ? '直接运行' : '保存为命令'}
                          </span>
                          <span
                            className={`mt-0.5 block truncate font-mono text-[11px] ${
                              isSelected ? 'text-on-primary/70' : 'text-muted-foreground'
                            }`}
                          >
                            {rawText}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[11px] ${
                            isSelected ? 'text-on-primary/70' : 'text-subtle'
                          }`}
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(displayError || notice) && (
                <p
                  role={displayError ? 'alert' : 'status'}
                  className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                    displayError
                      ? 'border-state-error/25 bg-state-error-soft text-state-error'
                      : 'border-state-success/25 bg-state-success-soft text-state-success'
                  }`}
                >
                  {displayError || notice}
                </p>
              )}
            </div>

            <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border px-4 text-[10.5px] text-muted-foreground">
              <span className="flex items-center gap-3">
                <span>↑ ↓ 选择</span>
                <span>Enter 运行</span>
                <button
                  type="button"
                  onClick={enterManageMode}
                  title="Ctrl + E"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-chip hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <SquarePen size={11} />
                  管理命令
                </button>
              </span>
              <span>{commandStore.visibleCommands.length} 条命令</span>
            </footer>
          </>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-rail/60">
              <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  命令 · {commandStore.visibleCommands.length}
                </span>
              </div>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {commandStore.visibleCommands.map((command) => {
                  const selected = editorCommand?.id === command.id && !isNewCommand;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => openEditor(command)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                        selected ? 'bg-primary-soft text-primary' : 'text-foreground hover:bg-chip'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1">
                          {command.pinned && (
                            <Pin size={10} className="shrink-0 text-muted-foreground" aria-label="已固定" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                            {command.name}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {getShellDisplayName(shellMap.get(command.shellId))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => openEditor(null)}
                  className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    isNewCommand
                      ? 'bg-primary text-on-primary'
                      : 'bg-chip text-foreground hover:bg-border-strong/40'
                  }`}
                >
                  <Plus size={14} />
                  新建命令
                </button>
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {editorCommand ? (
                <>
                  <div
                    className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-[12.5px] font-semibold">
                        {isNewCommand ? '新建命令' : '编辑命令'}
                      </h2>
                      {isDirty && (
                        <span className="shrink-0 rounded-full border border-state-warning/30 bg-state-warning-soft px-1.5 py-0.5 text-[9.5px] font-medium text-state-warning">
                          未保存的修改
                        </span>
                      )}
                    </div>
                    {notice ? (
                      <span className="shrink-0 text-[10px] font-medium text-state-success">{notice}</span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">Ctrl S 保存</span>
                    )}
                  </div>

                  <div
                    className="no-scrollbar min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5"
                    onKeyDown={handleEditorKeyDown}
                  >
                    <label className="block">
                      <span className="block text-[11px] font-medium text-foreground">名称</span>
                      <input
                        value={editorCommand.name}
                        onChange={(event) =>
                          setEditorCommand((current) =>
                            current ? { ...current, name: event.target.value } : current,
                          )
                        }
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="例如：部署固件"
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-input px-3 text-[12px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                      />
                    </label>

                    <div>
                      <span className="block text-[11px] font-medium text-foreground">Shell</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {commandStore.shells.map((shell) => {
                          const selected = editorCommand.shellId === shell.id;
                          return (
                            <button
                              key={shell.id}
                              type="button"
                              disabled={!shell.available}
                              aria-pressed={selected}
                              onClick={() =>
                                setEditorCommand((current) =>
                                  current ? { ...current, shellId: shell.id } : current,
                                )
                              }
                              className={`flex h-7 items-center rounded-md border px-2.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                                selected
                                  ? 'border-primary bg-primary text-on-primary'
                                  : 'border-border bg-chip text-foreground hover:border-border-strong'
                              }`}
                            >
                              {getShellDisplayName(shell)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="block">
                      <span className="block text-[11px] font-medium text-foreground">命令</span>
                      <textarea
                        ref={commandTextareaRef}
                        value={editorCommand.command}
                        onChange={(event) =>
                          setEditorCommand((current) =>
                            current ? { ...current, command: event.target.value } : current,
                          )
                        }
                        rows={5}
                        spellCheck={false}
                        placeholder={'例如：python deploy.py --build-no {{buildNo}}'}
                        className="mt-1.5 w-full resize-none rounded-lg border border-input bg-input px-3 py-2 font-mono text-[11.5px] leading-5 text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                      />
                      <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                        支持 {'{{参数名}}'} 占位符，运行时提示填写并记住上次取值；留空则只打开 Shell。
                      </span>
                    </label>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
                          扩展参数
                          {editorCommand.extension && (
                            <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {'{{'}ext{'}}'}
                            </code>
                          )}
                        </span>
                        {editorCommand.extension && !editorCommand.command.includes(EXTENSION_TOKEN) && (
                          <button
                            type="button"
                            onClick={insertExtensionToken}
                            className="shrink-0 text-[10.5px] font-medium text-primary transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            插入到命令
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {EXTENSION_OPTIONS.map(({ mode, label }) => {
                          const selected =
                            mode === 'none'
                              ? !editorCommand.extension
                              : editorCommand.extension?.mode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setExtensionOption(mode)}
                              className={`flex h-7 items-center rounded-md border px-2.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                                selected
                                  ? 'border-primary bg-primary text-on-primary'
                                  : 'border-border bg-chip text-foreground hover:border-border-strong'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {editorCommand.extension?.mode === 'increment' && (
                        <div className="mt-2 flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            起始值
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={editorCommand.extension.start}
                              onChange={(event) => updateExtensionStart(event.target.value)}
                              className="h-7 w-16 rounded-md border border-input bg-input px-2 text-right font-mono text-[11px] text-foreground outline-none focus:border-primary/55"
                              aria-label="扩展参数起始值"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            步长
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={editorCommand.extension.step}
                              onChange={(event) => updateExtensionStep(event.target.value)}
                              className="h-7 w-16 rounded-md border border-input bg-input px-2 text-right font-mono text-[11px] text-foreground outline-none focus:border-primary/55"
                              aria-label="扩展参数递增步长"
                            />
                          </label>
                        </div>
                      )}
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {editorCommand.extension?.mode === 'increment'
                          ? '首次运行使用起始值；每次成功运行后自动加步长，无需手动输入。'
                          : editorCommand.extension?.mode === 'input'
                            ? '每次运行时输入数字或字母，自动带入上次取值。'
                            : `在命令中插入 ${EXTENSION_TOKEN} 后，可选择数字自动递增或每次运行时输入。`}
                      </p>
                    </div>

                    <label className="block">
                      <span className="block text-[11px] font-medium text-foreground">
                        初始目录<span className="ml-1 font-normal text-muted-foreground">（可选）</span>
                      </span>
                      <input
                        value={editorCommand.cwd}
                        onChange={(event) =>
                          setEditorCommand((current) =>
                            current ? { ...current, cwd: event.target.value } : current,
                          )
                        }
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="例如：D:\\PROJECT\\demo"
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-input px-3 font-mono text-[11.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                      />
                    </label>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={editorCommand.pinned}
                      onClick={() =>
                        setEditorCommand((current) =>
                          current ? { ...current, pinned: !current.pinned } : current,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-chip/40 px-3 py-2.5 text-left transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span>
                        <span className="block text-[11px] font-medium text-foreground">固定到顶部</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          固定的命令始终排在运行列表最前面
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors ${
                          editorCommand.pinned ? 'bg-primary' : 'bg-border-strong'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-window shadow transition-all ${
                            editorCommand.pinned ? 'left-4' : 'left-0.5'
                          }`}
                        />
                      </span>
                    </button>

                    {editorError && (
                      <p role="alert" className="rounded-lg border border-state-error/25 bg-state-error-soft px-3 py-2 text-[11px] text-state-error">
                        {editorError}
                      </p>
                    )}
                  </div>

                  <div className="flex h-12 shrink-0 items-center justify-between border-t border-border px-4">
                    {isNewCommand ? (
                      <span className="text-[10.5px] text-muted-foreground">保存后即可在运行列表中搜索</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(editorCommand)}
                        className="flex h-7 items-center rounded-md px-2 text-[11px] text-state-error transition-colors hover:bg-state-error-soft focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        删除命令
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={exitManageMode}
                        className="inline-flex h-8 items-center rounded-lg border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEditor()}
                        disabled={isSaving}
                        className="inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-60"
                      >
                        {isSaving ? '保存中…' : '保存'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                  <Terminal size={22} className="text-subtle" aria-hidden="true" />
                  <p className="text-[12px] text-muted-foreground">选择左侧命令进行编辑，或新建命令</p>
                </div>
              )}
            </div>
          </div>
        )}

        <CommandParametersDialog
          open={pendingParameterCommand !== null}
          command={pendingParameterCommand}
          initialValues={parameterValues}
          parameterKeys={pendingParameterKeys}
          onSubmit={handleParameterSubmit}
          onCancel={cancelParameters}
        />

        <ConfirmDialog
          open={pendingDiscard !== null}
          title="放弃未保存的修改？"
          description="当前命令的修改还没有保存，切换后将丢失。"
          confirmLabel="放弃修改"
          onConfirm={() => {
            const proceed = pendingDiscard;
            setPendingDiscard(null);
            proceed?.();
          }}
          onCancel={() => setPendingDiscard(null)}
        />

        <ConfirmDialog
          open={deleteTarget !== null}
          title="删除命令？"
          description={deleteTarget ? `即将删除“${deleteTarget.name}”，该操作不可恢复。` : ''}
          confirmLabel="删除"
          onConfirm={() => void handleDeleteEditor()}
          onCancel={() => setDeleteTarget(null)}
        />
      </main>
    </div>
  );
});
