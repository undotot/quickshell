import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CheckCircle2, Cpu, HardDrive, Pencil, Pin, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { CommandStore } from '../features/commands/commandStore';
import type { CommandProfile, ShellId, ShellProfile } from '../features/shared/types';
import { TitleBar } from './TitleBar';

const commandStore = new CommandStore();

const createBlankCommand = (shellId: ShellId = 'powershell'): CommandProfile => ({
  id: crypto.randomUUID(),
  name: '',
  command: '',
  shellId,
  cwd: '',
  pinned: false,
  confirmBeforeRun: false,
});

/** Shell badge 语义色：PowerShell 绿、Git Bash 橙、其余蓝灰 */
const getShellBadgeClass = (shellId: ShellId): string => {
  switch (shellId) {
    case 'powershell':
    case 'pwsh':
      return 'bg-[rgba(88,211,155,0.12)] text-state-success';
    case 'git-bash':
      return 'bg-[rgba(246,182,101,0.12)] text-state-warning';
    default:
      return 'bg-[rgba(106,181,255,0.12)] text-state-info';
  }
};

const getShellDisplayName = (shellId: ShellId, shellName?: string): string => {
  switch (shellId) {
    case 'powershell':
      return 'PowerShell';
    case 'pwsh':
      return 'PowerShell 7';
    case 'git-bash':
      return 'Git Bash';
    default:
      return shellName ?? shellId;
  }
};

const ShellBadge = ({ shellId, shellName, available }: { shellId: ShellId; shellName?: string; available?: boolean }) => (
  <span
    className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${getShellBadgeClass(shellId)} ${
      available === false ? 'opacity-60' : ''
    }`}
  >
    {getShellDisplayName(shellId, shellName)}
    {available === false ? '（未检测到）' : ''}
  </span>
);

interface CommandListProps {
  commands: CommandProfile[];
  shells: Map<ShellId, ShellProfile>;
  editingId: string | null;
  onEdit: (command: CommandProfile) => void;
  onDelete: (command: CommandProfile) => void;
}

const CommandList = memo(function CommandList({ commands, shells, editingId, onEdit, onDelete }: CommandListProps) {
  return (
    <div className="space-y-1.5">
      {commands.map((command) => {
        const shell = shells.get(command.shellId);
        const isEditing = editingId === command.id;
        return (
          <div
            key={command.id}
            className={`relative flex min-h-[72px] items-center gap-3 overflow-hidden rounded-[12px] border px-3.5 transition-colors ${
              isEditing
                ? 'border-primary/50 bg-primary/[0.08]'
                : 'border-border bg-surface-2 hover:border-white/15 hover:bg-surface-3'
            }`}
          >
            {isEditing && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 bg-primary"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                {command.pinned && <Pin size={12} className="shrink-0 text-primary" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{command.name}</span>
                {command.confirmBeforeRun && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border border-state-warning/25 bg-state-warning/10 px-1 py-0.5 text-[10px] text-state-warning">
                    <ShieldAlert size={10} />
                    执行前确认
                  </span>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {command.command || '直接打开 Shell'}
              </p>
            </div>
            <ShellBadge shellId={command.shellId} shellName={shell?.name} available={shell?.available} />
            <button
              type="button"
              onClick={() => onEdit(command)}
              aria-label={`编辑 ${command.name}`}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                isEditing
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-input hover:text-foreground'
              }`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(command)}
              aria-label={`删除 ${command.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-error/15 hover:text-state-error focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
});

interface CommandEditorProps {
  command: CommandProfile;
  shells: ShellProfile[];
  isExisting: boolean;
  isSaving: boolean;
  formError: string;
  storeError: string;
  justSaved: boolean;
  onChange: (patch: Partial<CommandProfile>) => void;
  onCancel: () => void;
  onSave: () => void;
}

const CommandEditor = memo(function CommandEditor({
  command,
  shells,
  isExisting,
  isSaving,
  formError,
  storeError,
  justSaved,
  onChange,
  onCancel,
  onSave,
}: CommandEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {isExisting ? '编辑命令' : '新建命令'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          取消
        </button>
      </div>

      <label className="block text-[11px] text-muted-foreground">
        命令名称
        <input
          value={command.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="例如：启动前端"
          autoFocus
          className="mt-1 h-8 w-full rounded-lg border border-input bg-input px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/45 focus:outline-none"
        />
      </label>

      <label className="block text-[11px] text-muted-foreground">
        执行内容
        <textarea
          value={command.command}
          onChange={(event) => onChange({ command: event.target.value })}
          placeholder="留空表示只打开 Shell"
          className="mt-1 min-h-[88px] w-full resize-none rounded-lg border border-input bg-input px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary/45 focus:outline-none"
        />
      </label>

      <label className="block text-[11px] text-muted-foreground">
        使用 Shell
        <select
          value={command.shellId}
          onChange={(event) => onChange({ shellId: event.target.value as ShellId })}
          className="mt-1 h-8 w-full rounded-lg border border-input bg-input px-3 text-[13px] text-foreground focus:border-primary/45 focus:outline-none"
        >
          {shells.map((shell) => (
            <option key={shell.id} value={shell.id} className="bg-popover text-popover-foreground">
              {getShellDisplayName(shell.id, shell.name)}
              {shell.available ? '' : '（未检测到）'}
            </option>
          ))}
        </select>
        <p className="mt-1 truncate whitespace-nowrap text-[10px] text-muted-foreground/80">
          已检测到：{shells.filter((shell) => shell.available).map((shell) => getShellDisplayName(shell.id, shell.name)).join(' / ') || '无'}
        </p>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        初始目录
        <input
          value={command.cwd}
          onChange={(event) => onChange({ cwd: event.target.value })}
          placeholder="留空：不指定初始路径"
          className="mt-1 h-8 w-full rounded-lg border border-input bg-input px-3 font-mono text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary/45 focus:outline-none"
        />
      </label>

      <div className="overflow-hidden rounded-lg border border-border">
        <SwitchRow
          label="固定到命令列表顶部"
          description="在启动器中始终显示在最上方"
          checked={command.pinned}
          onToggle={(value) => onChange({ pinned: value })}
        />
        <div className="h-px bg-border" aria-hidden="true" />
        <SwitchRow
          label="执行前确认"
          description="运行该命令前先弹出确认窗口"
          checked={command.confirmBeforeRun}
          onToggle={(value) => onChange({ confirmBeforeRun: value })}
        />
      </div>

      {formError && (
        <p className="rounded-lg border border-state-error/20 bg-state-error/10 px-3 py-2 text-xs text-state-error">
          {formError}
        </p>
      )}
      {storeError && (
        <p className="rounded-lg border border-state-error/20 bg-state-error/10 px-3 py-2 text-xs text-state-error">
          {storeError}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={15} />
        {isSaving ? '保存中…' : '保存命令'}
      </button>

      {justSaved && !formError && !storeError && (
        <p className="flex items-center justify-center gap-1.5 rounded-lg bg-[rgba(88,211,155,0.1)] px-2.5 py-1.5 text-[11px] text-state-success">
          <CheckCircle2 size={14} />
          已保存，启动器列表已更新
        </p>
      )}
    </div>
  );
});

const SwitchRow = ({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onToggle(!checked)}
    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-input focus-visible:outline-2 focus-visible:outline-ring"
  >
    <span className="min-w-0 pr-3">
      <span className="block whitespace-nowrap text-[11px] font-medium text-foreground">{label}</span>
      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{description}</span>
    </span>
    <span
      aria-hidden="true"
      className={`relative h-4 w-8 rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);

export const CommandManagerWindow = observer(function CommandManagerWindow() {
  const [editing, setEditing] = useState<CommandProfile | null>(null);
  const [formError, setFormError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void commandStore.initialize();
  }, []);

  const shellMap = useMemo(
    () => new Map(commandStore.shells.map((shell) => [shell.id, shell])),
    [commandStore.shells],
  );

  const handleEdit = useCallback((command: CommandProfile) => {
    setFormError('');
    setJustSaved(false);
    setEditing({ ...command });
  }, []);

  const handleNew = useCallback(() => {
    setFormError('');
    setJustSaved(false);
    setEditing(createBlankCommand(commandStore.availableShells[0]?.id ?? 'powershell'));
  }, []);

  const handleChange = useCallback((patch: Partial<CommandProfile>) => {
    setJustSaved(false);
    setEditing((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setFormError('请输入命令名称。');
      return;
    }
    setFormError('');
    const saved = await commandStore.save({
      ...editing,
      name: editing.name.trim(),
      cwd: editing.cwd.trim(),
    });
    if (saved) {
      setEditing(null);
      setJustSaved(true);
    }
  }, [editing]);

  const handleDelete = useCallback(async (command: CommandProfile) => {
    if (!window.confirm(`确定删除“${command.name}”吗？`)) return;
    await commandStore.remove(command.id);
    setEditing((current) => (current?.id === command.id ? null : current));
  }, []);

  const pinnedCommands = commandStore.visibleCommands.filter((command) => command.pinned);
  const normalCommands = commandStore.visibleCommands.filter((command) => !command.pinned);
  const availableShellCount = commandStore.availableShells.length;

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <main className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_16px_36px_rgba(0,0,0,0.38)]">
        <TitleBar subtitle="管理命令" />

      {/* 工具栏 */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">管理命令</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {commandStore.commands.length} 项命令 · 已同步到启动器
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          disabled={commandStore.isLoading || commandStore.isSaving}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} />
          新建命令
        </button>
      </div>

      {/* 双栏工作台 */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-3 overflow-hidden p-4 max-[860px]:grid-cols-1 max-[860px]:overflow-y-auto">
        {/* 左栏：命令列表 */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-1.5 flex shrink-0 items-center justify-between px-0.5">
            <h2 className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <HardDrive size={12} aria-hidden="true" />
              已保存命令
            </h2>
            <span className="text-xs text-muted-foreground">{commandStore.commands.length} 项</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {commandStore.isLoading ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                正在加载…
              </p>
            ) : commandStore.commands.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">
                暂无命令
                <br />
                点击右上角「新建命令」创建第一条命令
              </p>
            ) : (
              <>
                {pinnedCommands.length > 0 && (
                  <>
                    <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <Pin size={12} aria-hidden="true" />
                      已固定
                    </p>
                    <CommandList
                      commands={pinnedCommands}
                      shells={shellMap}
                      editingId={editing?.id ?? null}
                      onEdit={handleEdit}
                      onDelete={(command) => void handleDelete(command)}
                    />
                  </>
                )}
                {normalCommands.length > 0 && (
                  <>
                    <p className="mb-1.5 mt-3 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      命令
                    </p>
                    <CommandList
                      commands={normalCommands}
                      shells={shellMap}
                      editingId={editing?.id ?? null}
                      onEdit={handleEdit}
                      onDelete={(command) => void handleDelete(command)}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {/* 右栏：编辑器 */}
        <section className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card/60 p-4">
          {editing ? (
            <CommandEditor
              command={editing}
              shells={commandStore.shells}
              isExisting={commandStore.commands.some((item) => item.id === editing.id)}
              isSaving={commandStore.isSaving}
              formError={formError}
              storeError={commandStore.errorMessage}
              justSaved={justSaved}
              onChange={handleChange}
              onCancel={() => {
                setEditing(null);
                setJustSaved(false);
              }}
              onSave={() => void handleSave()}
            />
          ) : (
            <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Pencil size={17} />
              </span>
              <p className="mt-2.5 text-[13px] text-foreground">
                {justSaved ? '保存成功' : '选择命令进行编辑'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {justSaved ? '启动器列表已同步更新' : '或点击右上角新建一条命令'}
              </p>
              {justSaved && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-state-success">
                  <CheckCircle2 size={14} />
                  已保存，启动器列表已更新
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 底部状态栏 */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-card/60 px-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <HardDrive size={12} aria-hidden="true" />
          数据存储于本地 · commands.json
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Cpu size={11} />
          {availableShellCount} 个 Shell 可用
        </span>
      </footer>
      </main>
    </div>
  );
});
