import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  commandText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 使用 Portal 挂载到 body，避免被主窗口内部的 overflow 或层级遮挡。
 * 视觉上保持轻量，交互上提供 Escape 和遮罩取消，接近 Ant Design 的确认弹窗。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  commandText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="取消确认"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[1px]"
        onClick={onCancel}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative z-[101] w-full max-w-[340px] overflow-hidden rounded-xl border border-border bg-popover shadow-[0_18px_46px_rgba(0,0,0,0.58)]"
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-state-warning/10 text-state-warning"
          >
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 id="confirm-dialog-title" className="text-[13px] font-semibold text-popover-foreground">
                {title}
              </h2>
              <button
                type="button"
                onClick={onCancel}
                aria-label="关闭确认弹窗"
                className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X size={14} />
              </button>
            </div>
            <p id="confirm-dialog-description" className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {description}
            </p>
            <code
              title={commandText}
              className="mt-2 block truncate rounded-md border border-border bg-input px-2 py-1.5 font-mono text-[10px] leading-4 text-foreground"
            >
              {commandText}
            </code>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-card/45 px-4 py-2.5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-ring"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
          >
            确认执行
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
