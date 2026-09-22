import { useCallback, useState } from 'react';
import type { CommandProfile } from '../shared/types';
import { launchShellProcess } from '../../features/shared/tauri';
import { commandRuntimeStore } from './commandRuntimeStore';
import { EXTENSION_KEY, getTemplateParameterKeys, renderCommandTemplate } from './commandTemplate';

interface UseCommandRunnerOptions {
  onError: (message: string) => void;
  /** 命令成功启动后回调（用于隐藏面板窗口）。 */
  onSuccess?: () => void | Promise<void>;
}

/**
 * 快捷运行的完整链路：
 * - 递增扩展参数：自动取当前计数，启动成功后推进一个步长，全程不打断；
 * - 其余 {{参数}}（含“每次输入”扩展参数）：弹参数框（带入上次取值）→ 渲染替换 → 独立控制台启动 → 记住本次取值。
 */
export function useCommandRunner({ onError, onSuccess }: UseCommandRunnerOptions) {
  const [pendingParameterCommand, setPendingParameterCommand] = useState<CommandProfile | null>(null);
  const [pendingParameterKeys, setPendingParameterKeys] = useState<string[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});

  const executeCommand = useCallback(
    async (command: CommandProfile, values: Record<string, string> = {}) => {
      const renderedCommand = renderCommandTemplate(command.command, values, command.shellId);
      try {
        const result = await launchShellProcess({
          shellId: command.shellId,
          cwd: command.cwd,
          initialCommand: renderedCommand,
        });
        if (!result.started) {
          onError('命令未能启动，请检查 Shell 配置。');
          return;
        }

        const extension = command.extension;
        // 递增计数只依赖“是否成功启动”；输入型取值在启动成功后记住。
        if (extension?.mode === 'increment') {
          await commandRuntimeStore.advanceExtensionCounter(command.id, extension);
        }
        const rememberedValues = extension?.mode === 'increment' && EXTENSION_KEY in values
          ? Object.fromEntries(
              Object.entries(values).filter(([key]) => key !== EXTENSION_KEY),
            )
          : values;
        if (Object.keys(rememberedValues).length > 0) {
          await commandRuntimeStore.commit(command.id, rememberedValues);
        }
        await onSuccess?.();
      } catch (error) {
        onError(error instanceof Error ? error.message : '命令启动失败。');
      }
    },
    [onError, onSuccess],
  );

  const runCommand = useCallback(
    async (command: CommandProfile) => {
      onError('');
      const keys = getTemplateParameterKeys(command.command);
      const extension = command.extension;
      const autoValues: Record<string, string> = {};
      let inputKeys = keys;

      // 递增扩展参数不打断运行：自动代入当前计数。
      if (extension?.mode === 'increment' && keys.includes(EXTENSION_KEY)) {
        autoValues[EXTENSION_KEY] = await commandRuntimeStore.getExtensionCounter(
          command.id,
          extension,
        );
        inputKeys = keys.filter((key) => key !== EXTENSION_KEY);
      }

      if (inputKeys.length === 0) {
        await executeCommand(command, autoValues);
        return;
      }

      try {
        const initialValues = await commandRuntimeStore.getInitialValues(command.id, inputKeys);
        setParameterValues({ ...initialValues, ...autoValues });
        setPendingParameterKeys(inputKeys);
        setPendingParameterCommand(command);
      } catch (error) {
        onError(error instanceof Error ? error.message : '启动参数读取失败。');
      }
    },
    [executeCommand, onError],
  );

  const handleParameterSubmit = useCallback(
    (values: Record<string, string>) => {
      if (!pendingParameterCommand) return;
      const command = pendingParameterCommand;
      setPendingParameterCommand(null);
      void executeCommand(command, values);
    },
    [executeCommand, pendingParameterCommand],
  );

  return {
    pendingParameterCommand,
    pendingParameterKeys,
    parameterValues,
    runCommand,
    executeCommand,
    handleParameterSubmit,
    cancelParameters: () => setPendingParameterCommand(null),
  };
}
