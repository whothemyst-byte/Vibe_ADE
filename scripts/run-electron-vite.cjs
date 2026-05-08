#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeWorkingDirectory(rawCwd) {
  if (typeof rawCwd !== 'string' || rawCwd.length === 0) {
    return process.cwd();
  }

  let cwd = rawCwd;

  // PowerShell provider prefix can leak into npm script CWD.
  const providerPrefix = 'Microsoft.PowerShell.Core\\FileSystem::';
  if (cwd.startsWith(providerPrefix)) {
    cwd = cwd.slice(providerPrefix.length);
  }

  // Win32 extended-length prefix (\\?\) breaks cmd-backed npm shims.
  if (cwd.startsWith('\\\\?\\')) {
    cwd = cwd.slice(4);
  }

  return path.resolve(cwd);
}

const mode = process.argv[2];
if (!mode) {
  console.error('Missing electron-vite mode. Usage: node scripts/run-electron-vite.cjs <dev|build|preview>');
  process.exit(1);
}

const normalizedCwd = normalizeWorkingDirectory(process.cwd());
process.chdir(normalizedCwd);

const electronVitePackageJson = require.resolve('electron-vite/package.json');
const cliEntrypoint = path.join(path.dirname(electronVitePackageJson), 'bin', 'electron-vite.js');
const result = spawnSync(process.execPath, [cliEntrypoint, mode, ...process.argv.slice(3)], {
  cwd: normalizedCwd,
  stdio: 'inherit',
  windowsHide: false
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
