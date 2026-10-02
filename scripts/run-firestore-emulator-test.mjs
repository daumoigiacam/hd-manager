import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const [testFileArgument, projectIdArgument] = process.argv.slice(2);
if (!testFileArgument || !projectIdArgument) {
  throw new Error('Usage: node scripts/run-firestore-emulator-test.mjs <test-file> <project-id>');
}

const workspace = process.cwd();
const testFile = path.resolve(workspace, testFileArgument);
const tempRoot = path.join(os.tmpdir(), `hd-manager-firestore-${projectIdArgument}`);
const firebaseConfigPath = path.join(tempRoot, 'firebase.json');
const rulesPath = path.join(tempRoot, 'firestore.rules');
const powershellRunnerPath = path.join(tempRoot, 'run-test.ps1');
const commandRunnerPath = path.join(tempRoot, 'run-test.cmd');
const require = createRequire(import.meta.url);
const firebaseCliPath = require.resolve('firebase-tools/lib/bin/firebase');

await mkdir(tempRoot, { recursive: true });
await copyFile(path.join(workspace, 'firestore.rules'), rulesPath);
await writeFile(firebaseConfigPath, `${JSON.stringify({
  firestore: { rules: 'firestore.rules' },
  emulators: { firestore: { host: '127.0.0.1', port: 8180 } },
}, null, 2)}\n`, 'utf8');

const quotePowerShell = value => `${value}`.replaceAll("'", "''");
const powershellScript = [
  `$ErrorActionPreference = 'Stop'`,
  `Set-Location -LiteralPath '${quotePowerShell(workspace)}'`,
  `& node '${quotePowerShell(testFile)}'`,
  `exit $LASTEXITCODE`,
  '',
].join('\r\n');
await writeFile(powershellRunnerPath, Buffer.from(`\ufeff${powershellScript}`, 'utf16le'));
await writeFile(commandRunnerPath, [
  '@echo off',
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${powershellRunnerPath}"`,
  'exit /b %ERRORLEVEL%',
  '',
].join('\r\n'), 'ascii');

const child = spawn(process.execPath, [
  firebaseCliPath,
  'emulators:exec',
  '--config', firebaseConfigPath,
  '--project', projectIdArgument,
  '--only', 'firestore',
  commandRunnerPath,
], {
  cwd: workspace,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: path.join(tempRoot, 'config'),
  },
  stdio: 'inherit',
  shell: false,
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(Number(code ?? 1)));
});
process.exitCode = exitCode;
