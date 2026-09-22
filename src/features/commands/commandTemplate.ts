import type { CommandExtension, CommandProfile, ShellId } from '../shared/types';

const PARAMETER_TOKEN_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g;

/** 扩展参数的固定占位符。 */
export const EXTENSION_TOKEN = '{{ext}}';
export const EXTENSION_KEY = 'ext';

const toNonNegativeInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;

/** 容错地整理扩展参数配置；模式非法时视为未配置。 */
export const normalizeCommandExtension = (
  extension: CommandExtension | undefined,
): CommandExtension | undefined => {
  if (!extension || (extension.mode !== 'increment' && extension.mode !== 'input')) {
    return undefined;
  }
  return {
    mode: extension.mode,
    start: toNonNegativeInt(extension.start, 1),
    step:
      extension.mode === 'increment' && typeof extension.step === 'number'
      && Number.isSafeInteger(extension.step) && extension.step >= 1
        ? extension.step
        : 1,
  };
};

/** 提取命令文本中的 {{参数名}} 占位符，按出现顺序去重。 */
export const getTemplateParameterKeys = (template: string): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const match of template.matchAll(PARAMETER_TOKEN_PATTERN)) {
    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
};

/** 容错地整理一份命令配置：修剪空白、兜底字段类型。 */
export const normalizeCommandProfile = (command: CommandProfile): CommandProfile => ({
  id: command.id,
  name: command.name?.trim() ?? '',
  command: command.command ?? '',
  shellId: command.shellId ?? 'powershell',
  cwd: command.cwd ?? '',
  pinned: Boolean(command.pinned),
  extension: normalizeCommandExtension(command.extension),
});

const getSurroundingQuote = (template: string, offset: number): "'" | '"' | null => {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < offset; index += 1) {
    const character = template[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = quote === character ? null : quote ?? character;
    }
  }
  return quote;
};

const escapeBashValue = (value: string, quote: "'" | '"' | null): string => {
  if (quote === '"') return value.replace(/["\\$`]/g, '\\$&');
  if (quote === "'") return value.replace(/'/g, "'\\''");
  return `'${value.replace(/'/g, "'\\''")}'`;
};

const escapePowerShellValue = (value: string, quote: "'" | '"' | null): string => {
  if (quote === '"') return value.replace(/[`"]+/g, (match) => match.split('').map((character) => `\`${character}`).join(''));
  if (quote === "'") return value.replace(/'/g, "''");
  return `'${value.replace(/'/g, "''")}'`;
};

const escapeCmdValue = (value: string, quote: "'" | '"' | null): string => {
  const escaped = value.replace(/[&|<>^]/g, '^$&').replace(/%/g, '%%');
  return quote ? escaped : `"${escaped.replace(/"/g, '\\"')}"`;
};

const escapeShellValue = (
  value: string,
  shellId: ShellId,
  quote: "'" | '"' | null,
): string => {
  switch (shellId) {
    case 'git-bash':
      return escapeBashValue(value, quote);
    case 'powershell':
    case 'pwsh':
      return escapePowerShellValue(value, quote);
    case 'cmd':
      return escapeCmdValue(value, quote);
    default:
      return escapeBashValue(value, quote);
  }
};

/** 将 {{参数名}} 替换为实际取值，并按目标 Shell 的规则转义。 */
export const renderCommandTemplate = (
  template: string,
  values: Record<string, string>,
  shellId: ShellId = 'powershell',
): string =>
  template.replace(PARAMETER_TOKEN_PATTERN, (token, key: string, offset: number) => {
    const value = values[key];
    if (value === undefined) return token;
    return escapeShellValue(value, shellId, getSurroundingQuote(template, offset));
  });
