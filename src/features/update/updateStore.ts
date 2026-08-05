import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { makeAutoObservable, runInAction } from 'mobx';
import { isDesktopRuntime } from '../shared/tauri';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_CHECKED_AT_KEY = 'quickshell.update.lastCheckedAt';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'installing'
  | 'error'
  | 'unsupported';

class UpdateStore {
  status: UpdateStatus = 'idle';
  pendingUpdate: Update | null = null;
  progress = 0;
  errorMessage = '';
  showUpdateDialog = false;
  noticeMessage = '';
  lastCheckedAt = 0;
  private noticeSequence = 0;

  constructor() {
    makeAutoObservable(this, { pendingUpdate: false }, { autoBind: true });
    this.lastCheckedAt = this.readLastCheckedAt();
  }

  get hasUpdate(): boolean {
    return this.pendingUpdate !== null;
  }

  async checkForUpdates(force = false, showDialog = false): Promise<void> {
    if (!isDesktopRuntime()) {
      this.status = 'unsupported';
      return;
    }

    if (this.status === 'checking' || this.status === 'installing') {
      return;
    }

    if (!force && Date.now() - this.lastCheckedAt < CHECK_INTERVAL_MS) {
      return;
    }

    this.status = 'checking';
    this.errorMessage = '';
    this.showUpdateDialog = false;
    this.noticeMessage = '';

    try {
      const update = await check({ timeout: 15_000 });
      const checkedAt = Date.now();
      localStorage.setItem(LAST_CHECKED_AT_KEY, String(checkedAt));

      runInAction(() => {
        this.lastCheckedAt = checkedAt;
        this.pendingUpdate = update;
        this.status = update ? 'available' : 'idle';
        this.showUpdateDialog = showDialog && update !== null;
        if (!update) {
          this.showLatestNotice();
        }
      });
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '检查更新失败。';
      });
    }
  }

  async installUpdate(): Promise<void> {
    const update = this.pendingUpdate;
    if (!update || this.status === 'installing') {
      return;
    }

    this.status = 'installing';
    this.showUpdateDialog = true;
    this.progress = 0;
    this.errorMessage = '';

    try {
      let contentLength = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          return;
        }

        if (event.event !== 'Progress') {
          return;
        }

        downloadedBytes += event.data.chunkLength;
        if (contentLength > 0) {
          runInAction(() => {
            this.progress = Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
          });
        }
      });

      await relaunch();
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '安装更新失败。';
      });
    }
  }

  dismissUpdate(): void {
    this.showUpdateDialog = false;
  }

  private showLatestNotice(): void {
    const sequence = ++this.noticeSequence;
    this.noticeMessage = '当前已是最新版本';

    window.setTimeout(() => {
      if (this.noticeSequence !== sequence) return;
      runInAction(() => {
        this.noticeMessage = '';
      });
    }, 4_000);
  }

  private readLastCheckedAt(): number {
    try {
      const value = Number(localStorage.getItem(LAST_CHECKED_AT_KEY));
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }
}

export const updateStore = new UpdateStore();
