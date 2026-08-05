import { observer } from 'mobx-react-lite';
import { Download, RefreshCw, X } from 'lucide-react';
import { updateStore } from '../features/update/updateStore';

export const UpdateDialog = observer(function UpdateDialog() {
  const update = updateStore.pendingUpdate;
  if (
    !update ||
    !updateStore.showUpdateDialog ||
    !['available', 'installing'].includes(updateStore.status)
  ) {
    return null;
  }

  const isInstalling = updateStore.status === 'installing';

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/55 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="w-full max-w-[330px] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              QuickShell 更新
            </p>
            <h2 id="update-dialog-title" className="mt-1 text-sm font-semibold">
              新版本 {update.version} 可用
            </h2>
          </div>
          {!isInstalling && (
            <button
              type="button"
              aria-label="稍后更新"
              onClick={updateStore.dismissUpdate}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {update.body || '本次更新包含功能改进和问题修复。'}
        </p>

        {isInstalling && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>正在下载并安装</span>
              <span>{updateStore.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${updateStore.progress}%` }}
              />
            </div>
          </div>
        )}

        {!isInstalling && (
          <button
            type="button"
            onClick={() => void updateStore.installUpdate()}
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Download size={14} />
            立即更新并重启
          </button>
        )}

        {isInstalling && (
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <RefreshCw size={12} className="animate-spin" />
            安装完成后应用将自动重启
          </div>
        )}
      </section>
    </div>
  );
});
