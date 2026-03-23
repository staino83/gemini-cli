/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { type SandboxManager, NoopSandboxManager } from './sandboxManager.js';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import type { SandboxConfig } from '../config/config.js';

/**
 * Creates a sandbox manager based on the provided settings.
 */
export function createSandboxManager(
  sandbox: SandboxConfig | undefined,
  workspace: string,
): SandboxManager {
  void workspace;

  if (
    os.platform() === 'win32' &&
    (sandbox?.enabled || sandbox?.command === 'windows-native')
  ) {
    return new WindowsSandboxManager();
  }

  return new NoopSandboxManager();
}
