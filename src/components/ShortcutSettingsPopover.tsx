import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CheckCircle2, Keyboard, Monitor, Moon, RefreshCw, RotateCcw, Sun } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { defaultSettings } from '../features/shared/types';
import type { ThemeMode } from '../features/shared/types';
import { settingsStore } from '../features/settings/settingsStore';
import type { ShortcutChangeResult } from '../features/shared/types';
import {
  requestGlobalShortcutChange,
  type SettingsSection,
} from '../features/shared/tauri';
import { useTheme } from '../features/theme/ThemeProvider';
import { updateStore } from '../features/update/updateStore';
import { UpdateDialog } from './UpdateDialog';
import { TitleBar } from './TitleBar';

const modifierKeys = new Set(['Control', 'Alt', 'Shift', 'Meta']);

export const formatShortcut = (shortcut: string): string =>
  shortcut
    .replace('CommandOrControl', 'Ctrl / ⌘')
    .split('+')
    .join(' + ');

const getShortcutFromEvent = (event: React.KeyboardEvent<HTMLElement>): string | null => {
  if (modifierKeys.has(event.key)) return null;

  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (modifiers.length === 0) return null;

  const keyNames: Record<string, string> = {
    ' ': 'Space',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    Backspace: 'Backspace',
    Delete: 'Delete',
    End: 'End',
    Enter: 'Enter',
    Escape: 'Escape',
    Home: 'Home',
    PageDown: 'PageDown',
    PageUp: 'PageUp',
    Tab: 'Tab',
  };
  const key = keyNames[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  if (!key || modifierKeys.has(key)) return null;

  return [...modifiers, key].join('+');
};

const KeyCap = ({ label }: { label: string }) => <kbd className="qs-kbd">{label}</kbd>;

const ShortcutDisplay = ({ shortcut }: { shortcut: string }) => {
  const parts = shortcut.split('+');

  return (
    <span
      className="flex flex-wrap items-center justify-center gap-1.5"
      aria-label={`当前快捷键 ${formatShortcut(shortcut)}`}
    >
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span className="qs-kbd-sep">+</span>}
          {part === 'CommandOrControl' ? (
            <>
              <KeyCap label="Ctrl" />
              <span className="qs-kbd-sep">/</span>
              <KeyCap label="⌘" />
            </>
          ) : (
            <KeyCap label={part} />
          )}
        </span>
      ))}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* 外观                                                                        */
/* -------------------------------------------------------------------------- */

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  description: string;
  Icon: typeof Monitor;
}> = [
  {
    mode: 'system',
    label: '跟随系统',
    description: '默认。随 Windows 浅色 / 深色设置自动切换',
    Icon: Monitor,
  },
  {
    mode: 'light',
    label: '浅色',
    description: '始终使用浅色主题，适合明亮环境',
    Icon: Sun,
  },
  {
    mode: 'dark',
    label: '深色',
    description: '始终使用深色主题，适合长时间盯屏',
    Icon: Moon,
  },
];

/** 迷你窗口示意：侧栏条 + 内容块，跟随当前主题实时变化。 */
const ThemePreview = () => (
  <div className="overflow-hidden rounded-lg border border-border bg-window">
    <div className="flex h-[22px] items-center gap-1.5 border-b border-border bg-rail px-2">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      <span className="text-[9px] font-medium text-subtle">QuickShell</span>
    </div>
    <div className="flex h-[102px]">
      <div className="flex w-[88px] shrink-0 flex-col gap-2.5 border-r border-border bg-rail px-2 py-2">
        <span className="h-3.5 rounded bg-border-strong" aria-hidden="true" />
        <span className="h-3.5 rounded bg-primary" aria-hidden="true" />
        <span className="h-3.5 rounded bg-border-strong" aria-hidden="true" />
        <span className="h-3.5 rounded bg-border-strong" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 bg-window p-2">
        <span className="h-2 w-[120px] rounded bg-border-strong" aria-hidden="true" />
        <span className="flex-1 rounded-[5px] bg-chip" aria-hidden="true" />
      </div>
    </div>
  </div>
);

const AppearanceSettingsPanel = observer(function AppearanceSettingsPanel() {
  const { mode, setMode } = useTheme();

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-[11px] font-medium text-muted-foreground">外观主题</h2>
        <div className="mt-2 space-y-2" role="radiogroup" aria-label="外观主题">
          {THEME_OPTIONS.map(({ mode: optionMode, label, description, Icon }) => {
            const selected = mode === optionMode;
            return (
              <button
                key={optionMode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(optionMode)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  selected
                    ? 'border-primary bg-primary-soft'
                    : 'border-border hover:border-border-strong hover:bg-chip/60'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-primary-soft text-primary' : 'bg-chip text-muted-foreground'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-primary' : 'border-border-strong'
                  }`}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] leading-5 text-muted-foreground">
        主题会立即应用到命令面板与所有弹窗，无需重启。
      </p>

      <section>
        <h2 className="text-[11px] font-medium text-muted-foreground">主题预览</h2>
        <div className="mt-2 rounded-[10px] border border-border bg-background p-2">
          <ThemePreview />
        </div>
      </section>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* 软件更新                                                                    */
/* -------------------------------------------------------------------------- */

const UpdateSettingsPanel = observer(function UpdateSettingsPanel() {
  const handleCheckUpdates = () => {
    void updateStore.checkForUpdates(true);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">软件更新</p>
        <h1 className="mt-1 text-sm font-semibold text-foreground">保持 QuickShell 最新</h1>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          手动检查更新，发现新版本后可在当前窗口完成下载、安装和重启。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-chip/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">检查更新</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {updateStore.status === 'checking'
                ? '正在连接更新服务…'
                : updateStore.status === 'error'
                  ? '检查失败，请稍后重试。'
                  : updateStore.lastCheckedAt > 0
                    ? `上次检查：${new Date(updateStore.lastCheckedAt).toLocaleString()}`
                    : '尚未检查更新'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCheckUpdates}
            disabled={updateStore.status === 'checking' || updateStore.status === 'installing'}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={updateStore.status === 'checking' ? 'animate-spin' : undefined}
            />
            立即检查
          </button>
        </div>
      </div>

      {updateStore.errorMessage && (
        <p role="alert" className="rounded-lg border border-state-error/20 bg-state-error-soft px-3 py-2 text-[11px] text-state-error">
          {updateStore.errorMessage}
        </p>
      )}

      {updateStore.status === 'idle' && updateStore.lastCheckedAt > 0 && !updateStore.pendingUpdate && (
        <p className="flex items-center rounded-lg border border-state-success/25 bg-state-success-soft px-3 py-2 text-[11px] text-state-success">
          当前已是最新版本。
        </p>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* 快捷键                                                                      */
/* -------------------------------------------------------------------------- */

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'shortcut', label: '快捷键' },
  { id: 'updates', label: '软件更新' },
  { id: 'appearance', label: '外观' },
];

const getInitialSettingsSection = (): SettingsSection => {
  const raw = new URLSearchParams(window.location.search).get('section');
  return SECTIONS.some((section) => section.id === raw) ? (raw as SettingsSection) : 'shortcut';
};

export const SettingsWindow = observer(function SettingsWindow() {
  const [capturing, setCapturing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [waitingForResult, setWaitingForResult] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>(getInitialSettingsSection);

  useEffect(() => {
    // 快捷键由主窗口统一注册；设置窗口只读取和保存配置，避免重复注册全局热键。
    void settingsStore.initialize(false);

    if (!('__TAURI_INTERNALS__' in window)) return;

    let disposers: Array<() => void> = [];
    void Promise.all([
      listen<ShortcutChangeResult>('shortcut-settings-result', (event) => {
        const result = event.payload;
        setWaitingForResult(false);
        setCapturing(false);
        settingsStore.errorMessage = result.success ? '' : result.message || '快捷键注册失败。';
        if (result.success) {
          settingsStore.settings = { ...settingsStore.settings, globalShortcut: result.shortcut };
          setSaved(true);
        } else {
          setSaved(false);
        }
      }),
      listen<string>('settings-section-requested', (event) => {
        const requested = event.payload;
        if (!SECTIONS.some((section) => section.id === requested)) return;
        setActiveSection(requested as SettingsSection);
        if (requested === 'updates') {
          void updateStore.checkForUpdates(true);
        }
      }),
    ]).then((unlisteners) => {
      disposers = unlisteners;
    });

    return () => disposers.forEach((dispose) => dispose());
  }, []);

  useEffect(() => {
    if (activeSection === 'updates') {
      void updateStore.checkForUpdates(true);
    }
  }, [activeSection]);

  const handleStartCapture = () => {
    settingsStore.errorMessage = '';
    setSaved(false);
    setWaitingForResult(false);
    setCapturing(true);
  };

  const handleCaptureKeyDown = async (event: React.KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (modifierKeys.has(event.key)) return;

    const shortcut = getShortcutFromEvent(event);
    if (!shortcut) {
      settingsStore.errorMessage = '请同时按下修饰键和一个普通按键。';
      return;
    }

    settingsStore.errorMessage = '';
    setWaitingForResult(true);
    try {
      await requestGlobalShortcutChange(shortcut);
    } catch (error) {
      setWaitingForResult(false);
      setCapturing(false);
      settingsStore.errorMessage = error instanceof Error ? error.message : '快捷键请求失败。';
    }
  };

  const handleReset = async () => {
    settingsStore.errorMessage = '';
    setSaved(false);
    setWaitingForResult(true);
    try {
      await requestGlobalShortcutChange(defaultSettings.globalShortcut);
    } catch (error) {
      setWaitingForResult(false);
      settingsStore.errorMessage = error instanceof Error ? error.message : '快捷键请求失败。';
    }
  };

  const currentShortcut = settingsStore.settings.globalShortcut;

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <section
        role="dialog"
        aria-label="设置窗口"
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--qs-window-shadow)]"
      >
        <TitleBar subtitle="设置" />

        <nav
          className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-3"
          aria-label="设置分类"
        >
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              aria-current={activeSection === section.id}
              className={`flex h-[30px] items-center rounded-md px-3 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                activeSection === section.id
                  ? 'bg-primary text-on-primary'
                  : 'text-muted-foreground hover:bg-chip hover:text-foreground'
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {activeSection === 'shortcut' && (
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                全局快捷键
              </p>
              <h1 className="text-sm font-semibold leading-tight text-foreground">唤起命令面板</h1>
              <p className="text-[11px] leading-[1.125rem] text-muted-foreground">
                在任意应用中按下组合键即可唤起 / 隐藏 QuickShell 命令面板。输入关键词筛选命令后按 Enter 运行，也可以直接输入任意命令立即执行。点击下方按键区后按下新的组合键，设置会立即保存并生效。
              </p>
            </div>

            <div className="capture-glow">
              <button
                type="button"
                onClick={handleStartCapture}
                onKeyDown={(event) => void handleCaptureKeyDown(event)}
                aria-label="按键设置快捷键"
                aria-pressed={capturing}
                disabled={waitingForResult}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg border border-primary/50 bg-primary-soft px-3 transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Keyboard size={18} className="shrink-0 text-primary" aria-hidden="true" />
                <ShortcutDisplay shortcut={currentShortcut} />
              </button>
            </div>

            {capturing ? (
              <p role="status" className="flex items-center gap-2 whitespace-nowrap text-[11px] text-primary">
                <span className="pulse-dot" aria-hidden="true" />
                <span>正在等待按键… 请按下修饰键 + 普通键</span>
              </p>
            ) : null}

            <div className="rounded-lg bg-chip/50 p-2.5">
              <p className="text-xs font-bold text-foreground">组合键规则</p>
              <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  必须包含至少一个修饰键（Ctrl / ⌘、Alt、Shift）
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  避免与系统与其它应用快捷键冲突
                </li>
              </ul>
            </div>

            {settingsStore.errorMessage ? (
              <p role="alert" className="rounded-lg border border-state-error/20 bg-state-error-soft px-3 py-2 text-xs text-state-error">
                {settingsStore.errorMessage}
              </p>
            ) : waitingForResult ? (
              <p role="status" className="rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-[11px] text-primary">
                正在注册快捷键…
              </p>
            ) : saved && !settingsStore.isSaving ? (
              <div className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-state-success/25 bg-state-success-soft px-3 py-2 text-[11px] font-medium text-state-success">
                <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                <span>快捷键已注册并生效</span>
              </div>
            ) : null}
          </div>
        )}

        {activeSection === 'updates' && (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <UpdateSettingsPanel />
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <AppearanceSettingsPanel />
          </div>
        )}

        {activeSection === 'shortcut' && (
          <footer className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3">
            <p className="whitespace-nowrap text-[11px] text-muted-foreground">
              默认：{formatShortcut(defaultSettings.globalShortcut)}
            </p>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={settingsStore.isSaving || waitingForResult || currentShortcut === defaultSettings.globalShortcut}
              aria-label="恢复默认快捷键"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={14} className="text-muted-foreground" aria-hidden="true" />
              恢复默认
            </button>
          </footer>
        )}
        <UpdateDialog />
      </section>
    </div>
  );
});

// 保留旧导出名，避免外部引用在升级期间失效。
export const ShortcutSettingsWindow = SettingsWindow;
export const ShortcutSettingsPopover = SettingsWindow;
