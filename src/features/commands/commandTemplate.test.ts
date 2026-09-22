import { describe, expect, it } from 'vitest';
import type { CommandProfile } from '../shared/types';
import {
  EXTENSION_TOKEN,
  getTemplateParameterKeys,
  normalizeCommandExtension,
  normalizeCommandProfile,
  renderCommandTemplate,
} from './commandTemplate';

const command: CommandProfile = {
  id: 'copy-package',
  name: '复制固件包',
  command: 'copy "build-{{packageNo}}" "release-{{packageNo}}"',
  shellId: 'powershell',
  cwd: '',
  pinned: false,
};

describe('command template', () => {
  it('extracts unique parameter keys in template order', () => {
    expect(getTemplateParameterKeys('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    expect(getTemplateParameterKeys('echo hello')).toEqual([]);
  });

  it('normalizes and trims command profiles', () => {
    expect(
      normalizeCommandProfile({
        id: 'a',
        name: '  部署  ',
        command: '',
        shellId: 'custom',
        cwd: ' D:\\demo ',
        pinned: true,
      }),
    ).toEqual({ id: 'a', name: '部署', command: '', shellId: 'custom', cwd: ' D:\\demo ', pinned: true });
  });

  it('renders parameter values into the template', () => {
    expect(renderCommandTemplate(command.command, { packageNo: '51' })).toContain('build-51');
    expect(renderCommandTemplate(command.command, { packageNo: '51' })).toContain('release-51');
  });

  it('keeps the token when a value is missing', () => {
    expect(renderCommandTemplate('echo {{buildNo}}', {})).toBe('echo {{buildNo}}');
  });

  it('escapes values for the target shell', () => {
    expect(renderCommandTemplate('echo {{v}}', { v: "it's" }, 'git-bash')).toBe("echo 'it'\\''s'");
    expect(renderCommandTemplate('echo {{v}}', { v: 'a&b' }, 'cmd')).toBe('echo "a^&b"');
    expect(renderCommandTemplate('echo "{{v}}"', { v: 'a"b' }, 'powershell')).toBe('echo "a`"b"');
  });

  it('respects surrounding quotes when escaping', () => {
    // 值已在模板里被单引号包裹时，不再额外包一层引号。
    expect(renderCommandTemplate("echo '{{v}}'", { v: "o'brien" }, 'git-bash')).toBe(
      "echo 'o'\\''brien'",
    );
  });
});

describe('command extension', () => {
  it('keeps valid extension configs and repairs invalid numbers', () => {
    expect(normalizeCommandExtension({ mode: 'increment', start: 10, step: 2 })).toEqual({
      mode: 'increment',
      start: 10,
      step: 2,
    });
    expect(normalizeCommandExtension({ mode: 'increment', start: -3, step: 0 })).toEqual({
      mode: 'increment',
      start: 1,
      step: 1,
    });
    expect(normalizeCommandExtension({ mode: 'input', start: 1, step: 1 })).toEqual({
      mode: 'input',
      start: 1,
      step: 1,
    });
  });

  it('drops extensions with unknown modes', () => {
    expect(
      normalizeCommandExtension({ mode: 'other', start: 1, step: 1 } as unknown as Parameters<
        typeof normalizeCommandExtension
      >[0]),
    ).toBeUndefined();
    expect(normalizeCommandExtension(undefined)).toBeUndefined();
  });

  it('normalizes profiles carrying an extension', () => {
    const normalized = normalizeCommandProfile({
      id: 'a',
      name: '部署',
      command: `python deploy.py --build-no ${EXTENSION_TOKEN}`,
      shellId: 'powershell',
      cwd: '',
      pinned: false,
      extension: { mode: 'increment', start: 5, step: 5 },
    });
    expect(normalized.extension).toEqual({ mode: 'increment', start: 5, step: 5 });
  });
});
