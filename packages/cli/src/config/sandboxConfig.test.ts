/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from '@google/gemini-cli-core';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSandboxConfig } from './sandboxConfig.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getPackageJson: vi.fn(),
    FatalSandboxError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalSandboxError';
      }
    },
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    platform: vi.fn(),
  };
});

const mockedGetPackageJson = vi.mocked(getPackageJson);
const mockedOsPlatform = vi.mocked(os.platform);

describe('loadSandboxConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env['SANDBOX'];
    delete process.env['GEMINI_SANDBOX'];
    mockedGetPackageJson.mockResolvedValue({
      config: { sandboxImageUri: 'default/image' },
    });
    mockedOsPlatform.mockReturnValue('win32');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return undefined if sandbox is explicitly disabled via argv', async () => {
    const config = await loadSandboxConfig({}, { sandbox: false });
    expect(config).toBeUndefined();
  });

  it('should return undefined if sandbox is explicitly disabled via settings', async () => {
    const config = await loadSandboxConfig({ tools: { sandbox: false } }, {});
    expect(config).toBeUndefined();
  });

  it('should return undefined if sandbox is not configured', async () => {
    const config = await loadSandboxConfig({}, {});
    expect(config).toBeUndefined();
  });

  it('should return undefined if already inside a sandbox', async () => {
    process.env['SANDBOX'] = '1';
    const config = await loadSandboxConfig({}, { sandbox: true });
    expect(config).toBeUndefined();
  });

  it('should not relaunch the CLI when windows-native sandbox is enabled via argv', async () => {
    const config = await loadSandboxConfig({}, { sandbox: true });
    expect(config).toBeUndefined();
  });

  it('should not relaunch the CLI when windows-native sandbox is enabled via env', async () => {
    process.env['GEMINI_SANDBOX'] = 'windows-native';
    const config = await loadSandboxConfig({}, {});
    expect(config).toBeUndefined();
  });

  it('should not relaunch the CLI when windows-native sandbox is enabled via settings object', async () => {
    const config = await loadSandboxConfig(
      {
        tools: {
          sandbox: {
            enabled: true,
            allowedPaths: ['C:\\tmp'],
            networkAccess: true,
          },
        },
      },
      {},
    );
    expect(config).toBeUndefined();
  });

  it('should reject unsupported sandbox commands', async () => {
    await expect(loadSandboxConfig({}, { sandbox: 'docker' })).rejects.toThrow(
      "Invalid sandbox command 'docker'. Must be one of windows-native",
    );
  });

  it('should reject sandbox configuration on non-Windows hosts', async () => {
    mockedOsPlatform.mockReturnValue('linux');
    await expect(loadSandboxConfig({}, { sandbox: true })).rejects.toThrow(
      'This fork of Gemini CLI only supports Windows.',
    );
  });
});
