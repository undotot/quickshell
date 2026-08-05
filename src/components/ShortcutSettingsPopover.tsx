import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CheckCircle2, Keyboard, RotateCcw } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { defaultSettings } from '../features/shared/types';
import { settingsStore } from '../features/settings/settingsStore';
import type { ShortcutChangeResult } from '../features/shared/types';
import { requestGlobalShortcutChange } from '../features/shared/tauri';
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

export const ShortcutSettingsWindow = observer(function ShortcutSettingsWindow() {
  const [capturing, setCapturing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [waitingForResult, setWaitingForResult] = useState(false);

  useEffect(() => {
    // 快捷键由主窗口统一注册；设置窗口只读取和保存配置，避免重复注册全局热键。
    void settingsStore.initialize(false);

    if (!('__TAURI_INTERNALS__' in window)) return;

    let dispose: (() => void) | undefined;
    void listen<ShortcutChangeResult>('shortcut-settings-result', (event) => {
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
    }).then((unlisten) => {
      dispose = unlisten;
    });

    return () => dispose?.();
  }, []);

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
        aria-label="快捷键设置窗口"
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_16px_36px_rgba(0,0,0,0.38)]"
      >
        <TitleBar subtitle="快捷键设置" />

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              全局快捷键
            </p>
            <h1 className="text-sm font-semibold leading-tight text-foreground">唤起主窗口</h1>
            <p className="text-[11px] leading-[1.125rem] text-muted-foreground">
              在任意应用中按下组合键即可唤起 / 隐藏 QuickShell 主窗口。点击下方按键区后按下新的组合键，设置会立即保存并生效。
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
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-lg border border-primary/50 bg-primary/10 px-3 transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
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

          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-xs font-bold text-foreground">组合键规则</p>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                必须包含至少一个修饰键（Ctrl / ⌘、Alt、Shift）
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                避免与系统与其它应用快捷键冲突
              </li>
            </ul>
          </div>

          {settingsStore.errorMessage ? (
            <p role="alert" className="rounded-lg border border-state-error/20 bg-state-error/10 px-3 py-2 text-xs text-state-error">
              {settingsStore.errorMessage}
            </p>
          ) : waitingForResult ? (
            <p role="status" className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] text-primary">
              正在注册快捷键…
            </p>
          ) : saved && !settingsStore.isSaving ? (
            <div className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-[rgba(88,211,155,0.25)] bg-[rgba(88,211,155,0.08)] px-3 py-2 text-[11px] font-medium text-state-success">
              <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
              <span>快捷键已注册并生效</span>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3">
          <p className="whitespace-nowrap text-[11px] text-muted-foreground">
            默认：{formatShortcut(defaultSettings.globalShortcut)}
          </p>
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={settingsStore.isSaving || waitingForResult || currentShortcut === defaultSettings.globalShortcut}
            aria-label="恢复默认快捷键"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={14} className="text-muted-foreground" aria-hidden="true" />
            恢复默认
          </button>
        </footer>
      </section>
    </div>
  );
});

// 保留旧导出名，避免外部引用在升级期间失效。
export const ShortcutSettingsPopover = ShortcutSettingsWindow;
