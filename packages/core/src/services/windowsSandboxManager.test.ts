/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import type { SandboxRequest } from './sandboxManager.js';
import { FatalSandboxError } from '../utils/errors.js';

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockSpawnAsync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();
  return {
    ...actual,
    spawnAsync: mockSpawnAsync,
  };
});

describe('WindowsSandboxManager', () => {
  const helperPath = path.resolve(
    '/home/runner/work/gemini-cli/gemini-cli/packages/core/src/services/scripts/GeminiSandbox.exe',
  );
  const sourcePath = helperPath.replace(/\.exe$/, '.cs');

  const baseRequest: SandboxRequest = {
    command: 'whoami',
    args: ['/groups'],
    cwd: '/test/cwd',
    env: { TEST_VAR: 'test_value' },
    config: {
      networkAccess: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockImplementation(
      (filePath: string) => filePath === helperPath,
    );
    mockSpawnAsync.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('should prepare a GeminiSandbox.exe command', async () => {
    const manager = new WindowsSandboxManager('win32');

    const result = await manager.prepareCommand(baseRequest);

    expect(result.program).toBe(helperPath);
    expect(result.args).toEqual(['0', '/test/cwd', 'whoami', '/groups']);
    expect(mockSpawnAsync).toHaveBeenCalledWith('icacls', [
      path.resolve('/test/cwd'),
      '/setintegritylevel',
      'Low',
    ]);
  });

  it('should handle networkAccess from config', async () => {
    const manager = new WindowsSandboxManager('win32');

    const result = await manager.prepareCommand({
      ...baseRequest,
      args: [],
      config: {
        networkAccess: true,
      },
    });

    expect(result.args[0]).toBe('1');
  });

  it('should sanitize environment variables', async () => {
    const manager = new WindowsSandboxManager('win32');

    const result = await manager.prepareCommand({
      ...baseRequest,
      command: 'test',
      args: [],
      env: {
        API_KEY: 'secret',
        PATH: '/usr/bin',
      },
      config: {
        sanitizationConfig: {
          allowedEnvironmentVariables: ['PATH'],
          blockedEnvironmentVariables: ['API_KEY'],
          enableEnvironmentVariableRedaction: true,
        },
      },
    });

    expect(result.env['PATH']).toBe('/usr/bin');
    expect(result.env['API_KEY']).toBeUndefined();
  });

  it('should fail with a helpful error when the helper source is missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const manager = new WindowsSandboxManager('win32');

    await expect(manager.prepareCommand(baseRequest)).rejects.toThrow(
      FatalSandboxError,
    );
    await expect(manager.prepareCommand(baseRequest)).rejects.toThrow(
      sourcePath,
    );
  });

  it('should fail when low integrity access cannot be granted', async () => {
    mockSpawnAsync.mockRejectedValueOnce(new Error('icacls failed'));
    const manager = new WindowsSandboxManager('win32');

    await expect(manager.prepareCommand(baseRequest)).rejects.toThrow(
      FatalSandboxError,
    );
    await expect(manager.prepareCommand(baseRequest)).rejects.toThrow(
      path.resolve('/test/cwd'),
    );
  });
});
