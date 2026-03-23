/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, vi, afterEach } from 'vitest';
import {
  escapeShellArg,
  getCommandRoots,
  getShellConfiguration,
  hasRedirection,
  stripShellWrapper,
  resolveExecutable,
} from './shell-utils.js';
import path from 'node:path';

const mockPlatform = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  default: {
    platform: mockPlatform,
  },
  platform: mockPlatform,
}));

const mockAccess = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  default: {
    promises: {
      access: mockAccess,
    },
    constants: { X_OK: 1 },
  },
  promises: {
    access: mockAccess,
  },
  constants: { X_OK: 1 },
}));

const mockSpawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  spawn: vi.fn(),
}));

const mockQuote = vi.hoisted(() => vi.fn());
vi.mock('shell-quote', () => ({
  quote: mockQuote,
}));

beforeEach(() => {
  mockPlatform.mockReturnValue('win32');
  mockQuote.mockImplementation((args: string[]) =>
    args.map((arg) => `'${arg}'`).join(' '),
  );
  mockSpawnSync.mockReturnValue({
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
    status: 0,
    error: undefined,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

const mockPowerShellResult = (
  commands: Array<{ name: string; text: string }>,
  hasRedirection: boolean,
) => {
  mockSpawnSync.mockReturnValue({
    stdout: Buffer.from(
      JSON.stringify({
        success: true,
        commands,
        hasRedirection,
      }),
    ),
    stderr: Buffer.from(''),
    status: 0,
    error: undefined,
  });
};

describe('getCommandRoots', () => {
  it('should return command roots from PowerShell AST output', () => {
    mockPowerShellResult(
      [
        { name: 'git', text: 'git status' },
        { name: 'Write-Host', text: 'Write-Host done' },
      ],
      false,
    );

    expect(getCommandRoots('git status; Write-Host done')).toEqual([
      'git',
      'Write-Host',
    ]);
  });

  it('should return an empty array when PowerShell parsing fails', () => {
    mockSpawnSync.mockReturnValue({
      stdout: Buffer.from('invalid json'),
      stderr: Buffer.from(''),
      status: 0,
      error: undefined,
    });

    expect(getCommandRoots('git status')).toEqual([]);
  });
});

describe('hasRedirection', () => {
  it('should detect redirection from PowerShell AST output', () => {
    mockPowerShellResult(
      [{ name: 'Get-Content', text: 'Get-Content file.txt' }],
      true,
    );
    expect(hasRedirection('Get-Content file.txt > out.txt')).toBe(true);
  });

  it('should return false when PowerShell parser reports no redirection', () => {
    mockPowerShellResult(
      [{ name: 'Get-Content', text: 'Get-Content file.txt' }],
      false,
    );
    expect(hasRedirection('Get-Content file.txt')).toBe(false);
  });
});

describe('stripShellWrapper', () => {
  it('should strip cmd.exe /c', () => {
    expect(stripShellWrapper('cmd.exe /c "dir"')).toBe('dir');
  });

  it('should strip powershell wrapper with -NoProfile', () => {
    expect(
      stripShellWrapper('powershell.exe -NoProfile -Command Get-ChildItem'),
    ).toBe('Get-ChildItem');
  });

  it('should not strip commands without a wrapper', () => {
    expect(stripShellWrapper('git status')).toBe('git status');
  });
});

describe('escapeShellArg', () => {
  it('should use shell-quote for bash escaping', () => {
    expect(escapeShellArg('hello world', 'bash')).toBe("'hello world'");
  });

  it('should escape PowerShell arguments with single quotes', () => {
    expect(escapeShellArg("can't", 'powershell')).toBe("'can''t'");
  });

  it('should escape cmd arguments with double quotes', () => {
    expect(escapeShellArg('hello', 'cmd')).toBe('"hello"');
  });
});

describe('getShellConfiguration', () => {
  it('should return PowerShell configuration by default', () => {
    delete process.env['ComSpec'];
    const config = getShellConfiguration();
    expect(config.executable).toBe('powershell.exe');
    expect(config.argsPrefix).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
    ]);
    expect(config.shell).toBe('powershell');
  });

  it('should use ComSpec when it points to PowerShell', () => {
    const psPath =
      'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    process.env['ComSpec'] = psPath;
    const config = getShellConfiguration();
    expect(config.executable).toBe(psPath);
    expect(config.argsPrefix).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
    ]);
  });

  it('should ignore ComSpec when it points to cmd.exe', () => {
    process.env['ComSpec'] = 'C:\\WINDOWS\\system32\\cmd.exe';
    const config = getShellConfiguration();
    expect(config.executable).toBe('powershell.exe');
  });
});

describe('resolveExecutable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockAccess.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return the absolute path if it exists and is executable', async () => {
    const absPath = path.resolve('/usr/bin/git');
    mockAccess.mockResolvedValue(undefined);
    expect(await resolveExecutable(absPath)).toBe(absPath);
  });

  it('should try Windows extensions when resolving from PATH', async () => {
    process.env['PATH'] = path.resolve('C:\\Windows\\System32');
    mockAccess.mockImplementation(async (filePath: string) => {
      if (filePath.includes('cmd.exe')) return undefined;
      throw new Error('ENOENT');
    });

    expect(await resolveExecutable('cmd')).toContain('cmd.exe');
  });

  it('should return undefined if not found in PATH', async () => {
    process.env['PATH'] = path.resolve('/bin');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    expect(await resolveExecutable('unknown')).toBeUndefined();
  });
});
