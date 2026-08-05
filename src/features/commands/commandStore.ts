import { makeAutoObservable, runInAction } from 'mobx';
import {
  defaultCommands,
  type CommandProfile,
  type ShellProfile,
} from '../shared/types';
import { detectShells, loadCommandProfiles, notifyCommandsChanged, saveCommandProfiles } from '../shared/tauri';

export class CommandStore {
  commands: CommandProfile[] = [];
  shells: ShellProfile[] = [];
  isLoading = true;
  errorMessage = '';
  isSaving = false;
  initializing: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(this, { initializing: false }, { autoBind: true });
  }

  get visibleCommands(): CommandProfile[] {
    return [...this.commands].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
  }

  get availableShells(): ShellProfile[] {
    return this.shells.filter((shell) => shell.available);
  }

  async initialize(): Promise<void> {
    if (this.initializing) return this.initializing;

    this.initializing = this.loadFromDisk();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async reloadCommands(): Promise<void> {
    try {
      const commands = await loadCommandProfiles();
      runInAction(() => {
        this.commands = commands;
        this.errorMessage = '';
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = error instanceof Error ? error.message : '命令列表同步失败。';
      });
    }
  }

  private async loadFromDisk(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [shells, commands] = await Promise.all([detectShells(), loadCommandProfiles()]);
      runInAction(() => {
        this.shells = shells;
        this.commands = commands;
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.shells = this.fallbackShells();
        this.commands = defaultCommands;
        this.errorMessage = error instanceof Error ? error.message : '无法加载本地配置。';
        this.isLoading = false;
      });
    }
  }

  async save(command: CommandProfile): Promise<boolean> {
    const nextCommands = this.commands.some((item) => item.id === command.id)
      ? this.commands.map((item) => (item.id === command.id ? command : item))
      : [...this.commands, command];

    this.isSaving = true;
    this.errorMessage = '';
    try {
      await saveCommandProfiles(nextCommands);
      runInAction(() => {
        this.commands = nextCommands;
        this.isSaving = false;
      });
      await notifyCommandsChanged();
      return true;
    } catch (error) {
      runInAction(() => {
        this.errorMessage = error instanceof Error ? error.message : '命令保存失败。';
        this.isSaving = false;
      });
      return false;
    }
  }

  async remove(commandId: string): Promise<boolean> {
    const nextCommands = this.commands.filter((command) => command.id !== commandId);
    this.isSaving = true;
    this.errorMessage = '';
    try {
      await saveCommandProfiles(nextCommands);
      runInAction(() => {
        this.commands = nextCommands;
        this.isSaving = false;
      });
      await notifyCommandsChanged();
      return true;
    } catch (error) {
      runInAction(() => {
        this.errorMessage = error instanceof Error ? error.message : '命令删除失败。';
        this.isSaving = false;
      });
      return false;
    }
  }

  findCommand(commandId: string): CommandProfile | undefined {
    return this.commands.find((command) => command.id === commandId);
  }

  private fallbackShells(): ShellProfile[] {
    return [
      { id: 'cmd', name: 'CMD', executable: 'cmd.exe', args: [], available: true },
      {
        id: 'powershell',
        name: 'Windows PowerShell',
        executable: 'powershell.exe',
        args: ['-NoLogo'],
        available: true,
      },
      { id: 'pwsh', name: 'PowerShell 7', executable: 'pwsh.exe', args: ['-NoLogo'], available: false },
      { id: 'git-bash', name: 'Git Bash', executable: 'bash.exe', args: ['--login', '-i'], available: false },
    ];
  }
}
