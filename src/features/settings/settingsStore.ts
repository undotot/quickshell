import { makeAutoObservable, runInAction } from 'mobx';
import { defaultSettings, type AppSettings } from '../shared/types';
import {
  loadAppSettings,
  saveAppSettings,
  setGlobalShortcut,
} from '../shared/tauri';

export class SettingsStore {
  settings: AppSettings = { ...defaultSettings };
  isLoading = true;
  isSaving = false;
  errorMessage = '';
  initializing: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(this, { initializing: false }, { autoBind: true });
  }

  async initialize(registerShortcut = true): Promise<void> {
    if (this.initializing) return this.initializing;

    this.initializing = this.loadFromDisk(registerShortcut);
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async updateGlobalShortcut(globalShortcut: string): Promise<boolean> {
    const previousShortcut = this.settings.globalShortcut;
    this.isSaving = true;
    this.errorMessage = '';

    try {
      await setGlobalShortcut(globalShortcut);
      const nextSettings = { ...this.settings, globalShortcut };
      try {
        await saveAppSettings(nextSettings);
      } catch (error) {
        await setGlobalShortcut(previousShortcut);
        throw error;
      }

      runInAction(() => {
        this.settings = nextSettings;
        this.isSaving = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.errorMessage = error instanceof Error ? error.message : '快捷键保存失败。';
        this.isSaving = false;
      });
      return false;
    }
  }

  async reload(registerShortcut = true): Promise<void> {
    await this.loadFromDisk(registerShortcut);
  }

  private async loadFromDisk(registerShortcut: boolean): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const settings = await loadAppSettings();
      runInAction(() => {
        this.settings = { ...defaultSettings, ...settings };
        this.isLoading = false;
      });

      if (registerShortcut) {
        try {
          await setGlobalShortcut(this.settings.globalShortcut);
        } catch (error) {
          runInAction(() => {
            this.errorMessage = error instanceof Error ? error.message : '快捷键注册失败。';
          });
        }
      }
    } catch (error) {
      runInAction(() => {
        this.settings = { ...defaultSettings };
        this.errorMessage = error instanceof Error ? error.message : '无法加载应用设置。';
        this.isLoading = false;
      });
    }
  }
}

export const settingsStore = new SettingsStore();
