import { Terminal, X } from 'lucide-react';
import { closeCurrentWindow } from '../features/shared/tauri';

interface TitleBarProps {
  /** 窗口副标题，例如「命令启动器」「管理命令」 */
  subtitle: string;
}

/**
 * 无边框窗口统一标题栏：
 * 整条区域可拖拽移动窗口（data-tauri-drag-region），
 * 右上角仅保留关闭按钮。
 */
export const TitleBar = ({ subtitle }: TitleBarProps) => {
  const handleClose = () => {
    void closeCurrentWindow();
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card/60 px-2.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
        className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <Terminal size={13} strokeWidth={2} />
        </span>
        <span className="truncate text-[12px] font-semibold text-foreground">
          QuickShell
        </span>
        <span className="truncate text-[10px] text-muted-foreground">· {subtitle}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="关闭窗口"
          data-no-drag
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-error/15 hover:text-state-error focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
};
