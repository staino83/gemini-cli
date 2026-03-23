/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getPackageJson,
  type SandboxConfig,
  FatalSandboxError,
} from '@google/gemini-cli-core';
import * as os from 'node:os';
import type { Settings } from './settings.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This is a stripped-down version of the CliArgs interface from config.ts
// to avoid circular dependencies.
interface SandboxCliArgs {
  sandbox?: boolean | string | null;
}
const VALID_SANDBOX_COMMANDS = ['windows-native'];

function isSandboxCommand(
  value: string,
): value is Exclude<SandboxConfig['command'], undefined> {
  return (VALID_SANDBOX_COMMANDS as ReadonlyArray<string | undefined>).includes(
    value,
  );
}

function getSandboxCommand(
  sandbox?: boolean | string | null,
): SandboxConfig['command'] | '' {
  // If the SANDBOX env var is set, we're already inside the sandbox.
  if (process.env['SANDBOX']) {
    return '';
  }

  // note environment variable takes precedence over argument (from command line or settings)
  const environmentConfiguredSandbox =
    process.env['GEMINI_SANDBOX']?.toLowerCase().trim() ?? '';
  sandbox =
    environmentConfiguredSandbox?.length > 0
      ? environmentConfiguredSandbox
      : sandbox;
  if (sandbox === '1' || sandbox === 'true') sandbox = true;
  else if (sandbox === '0' || sandbox === 'false' || !sandbox) sandbox = false;

  if (sandbox === false) {
    return '';
  }

  if (os.platform() !== 'win32') {
    throw new FatalSandboxError(
      'This fork of Gemini CLI only supports Windows.',
    );
  }

  if (typeof sandbox === 'string' && sandbox) {
    if (!isSandboxCommand(sandbox)) {
      throw new FatalSandboxError(
        `Invalid sandbox command '${sandbox}'. Must be one of ${VALID_SANDBOX_COMMANDS.join(
          ', ',
        )}`,
      );
    }
    return sandbox;
  }

  if (sandbox === true) {
    return 'windows-native';
  }

  return '';
}

export async function loadSandboxConfig(
  settings: Settings,
  argv: SandboxCliArgs,
): Promise<SandboxConfig | undefined> {
  const sandboxOption = argv.sandbox ?? settings.tools?.sandbox;

  let sandboxValue: boolean | string | null | undefined;
  let allowedPaths: string[] = [];
  let networkAccess = false;
  let customImage: string | undefined;

  if (
    typeof sandboxOption === 'object' &&
    sandboxOption !== null &&
    !Array.isArray(sandboxOption)
  ) {
    const config = sandboxOption;
    sandboxValue = config.enabled ? (config.command ?? true) : false;
    allowedPaths = config.allowedPaths ?? [];
    networkAccess = config.networkAccess ?? false;
    customImage = config.image;
  } else if (typeof sandboxOption !== 'object' || sandboxOption === null) {
    sandboxValue = sandboxOption;
  }

  const command = getSandboxCommand(sandboxValue);

  const packageJson = await getPackageJson(__dirname);
  const image =
    process.env['GEMINI_SANDBOX_IMAGE'] ??
    process.env['GEMINI_SANDBOX_IMAGE_DEFAULT'] ??
    customImage ??
    packageJson?.config?.sandboxImageUri;

  return command && image && command !== 'windows-native'
    ? { enabled: true, allowedPaths, networkAccess, command, image }
    : undefined;
}
