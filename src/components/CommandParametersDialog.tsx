import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Play, Terminal } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { CommandProfile } from '../features/shared/types';
import { getTemplateParameterKeys, renderCommandTemplate } from '../features/commands/commandTemplate';

interface CommandParametersDialogProps {
  open: boolean;
  command: CommandProfile | null;
  initialValues: Record<string, string>;
  /** 限定要收集的占位符；缺省时从命令文本自动提取。递增扩展参数不在此列。 */
  parameterKeys?: string[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/** 运行含 {{参数}} 的命令时，在面板内就地收集一次参数取值。 */
export function CommandParametersDialog({
  open,
  command,
  initialValues,
  parameterKeys,
  onSubmit,
  onCancel,
}: CommandParametersDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');

  const keys = useMemo(
    () => (command ? parameterKeys ?? getTemplateParameterKeys(command.command) : []),
    [command, parameterKeys],
  );
  const previewCommand = command
    ? renderCommandTemplate(command.command, values, command.shellId)
    : '';

  useEffect(() => {
    if (!open || !command) return;
    setValues(initialValues);
    setErrorMessage('');
  }, [command, initialValues, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, open]);

  if (!open || !command || keys.length === 0) return null;

  const handleValueChange = (key: string, value: string) => {
    setErrorMessage('');
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = () => {
    const missing = keys.find((key) => (values[key] ?? '').trim() === '');
    if (missing) {
      setErrorMessage(`请填写参数“${missing}”。`);
      return;
    }
    onSubmit(values);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleSubmit();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px]" role="presentation">
      <button
        type="button"
        aria-label="取消输入参数"
        className="fixed inset-0 cursor-default"
        onClick={onCancel}
      />

      <div className="relative z-[101] flex min-h-full items-center justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-parameters-title"
          className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-border-strong bg-popover shadow-[var(--qs-window-shadow)]"
        >
          <header className="flex items-start gap-3 border-b border-border px-4 pb-3 pt-4">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20"
            >
              <Terminal size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="command-parameters-title" className="truncate text-[13px] font-semibold text-popover-foreground">
                启动参数
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{command.name}</p>
            </div>
          </header>

          <div className="space-y-3 px-4 py-4">
            {keys.map((key, index) => (
              <label key={key} className="block">
                <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-foreground">
                  <span className="min-w-0 truncate">{key}</span>
                  <code className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {'{{'}{key}{'}}'}
                  </code>
                </span>
                <input
                  autoFocus={index === 0}
                  value={values[key] ?? ''}
                  onChange={(event) => handleValueChange(key, event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="请输入本次取值"
                  className="mt-1.5 h-9 w-full rounded-lg border border-input bg-input px-3 font-mono text-[12px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                />
                <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">
                  {initialValues[key]
                    ? '已带入上次输入，可直接修改。'
                    : '支持数字或字母，启动成功后会记住。'}
                </span>
              </label>
            ))}

            <div className="overflow-hidden rounded-xl border border-border bg-code">
              <div className="border-b border-border px-3 py-2 text-[10px] font-medium text-muted-foreground">
                执行预览
              </div>
              <code
                title={previewCommand}
                className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-[11px] leading-5 text-foreground"
              >
                {previewCommand}
              </code>
            </div>

            {errorMessage && (
              <p role="alert" className="rounded-lg border border-state-error/25 bg-state-error-soft px-3 py-2 text-[11px] text-state-error">
                {errorMessage}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border bg-card/55 px-4 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-ring"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Play size={12} fill="currentColor" />
              启动
            </button>
          </footer>
        </section>
      </div>
    </div>,
    document.body,
  );
}
