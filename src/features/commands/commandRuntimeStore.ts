import type { CommandExtension, CommandRuntimeValues } from '../shared/types';
import { loadCommandRuntimeValues, saveCommandRuntimeValues } from '../shared/tauri';

const EXTENSION_STORAGE_KEY = 'ext';

/**
 * 记录每条命令最近一次使用的参数取值；
 * 下次启动自动带入，让 {{参数}} 命令可以连续快速重跑。
 */
export class CommandRuntimeStore {
  private values: CommandRuntimeValues = {};
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initializing) return this.initializing;

    this.initializing = loadCommandRuntimeValues()
      .then((values) => {
        this.values = values ?? {};
      })
      .catch(() => {
        this.values = {};
      })
      .finally(() => {
        this.initializing = null;
      });

    return this.initializing;
  }

  /** 以“上次取值”为默认值生成一份参数初值。 */
  async getInitialValues(commandId: string, keys: string[]): Promise<Record<string, string>> {
    await this.initialize();
    const saved = this.values[commandId] ?? {};
    return Object.fromEntries(keys.map((key) => [key, saved[key] ?? '']));
  }

  async commit(commandId: string, values: Record<string, string>): Promise<void> {
    await this.initialize();
    const keys = new Set(Object.keys(this.values[commandId] ?? {}));
    for (const key of Object.keys(values)) keys.add(key);

    const nextForCommand: Record<string, string> = {};
    for (const key of keys) {
      const value = values[key];
      // 空值不覆盖已记住的内容，避免一次误清空。
      nextForCommand[key] = value === undefined ? this.values[commandId]?.[key] ?? '' : value;
    }

    const nextValues: CommandRuntimeValues = { ...this.values, [commandId]: nextForCommand };
    await saveCommandRuntimeValues(nextValues);
    this.values = nextValues;
  }

  /** 递增模式：读取下次要使用的计数值（无记录时用起始值）。 */
  async getExtensionCounter(commandId: string, extension: CommandExtension): Promise<string> {
    await this.initialize();
    const saved = this.values[commandId]?.[EXTENSION_STORAGE_KEY];
    const parsed = saved !== undefined && saved !== '' ? Number(saved) : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? String(parsed) : String(extension.start);
  }

  /** 递增模式：本次启动成功后把计数推进一个步长。 */
  async advanceExtensionCounter(
    commandId: string,
    extension: CommandExtension,
  ): Promise<void> {
    await this.initialize();
    const current = Number(await this.getExtensionCounter(commandId, extension));
    const next = Number.isSafeInteger(current) ? current + extension.step : extension.start;

    const nextValues: CommandRuntimeValues = {
      ...this.values,
      [commandId]: {
        ...(this.values[commandId] ?? {}),
        [EXTENSION_STORAGE_KEY]: String(next),
      },
    };
    await saveCommandRuntimeValues(nextValues);
    this.values = nextValues;
  }
}

export const commandRuntimeStore = new CommandRuntimeStore();
