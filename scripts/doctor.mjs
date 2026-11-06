#!/usr/bin/env node
// Local verification only. Checks the core project and what this machine can build,
// then writes Builds/support-report.json. Nothing is uploaded.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Works on the project in the current folder: the framework checkout or a generated game.
const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const host = process.platform; // 'darwin' | 'win32' | 'linux'
const shell = host === 'win32';
const run = (command, args, options = {}) => spawnSync(command, args, { cwd: root, shell, encoding: 'utf8', stdio: 'pipe', ...options });
const available = (command, args = ['--version']) => run(command, args).status === 0;
const rustTarget = target => (run('rustup', ['target', 'list', '--installed']).stdout ?? '').split('\n').includes(target);
const desktopHosts = ['win32', 'darwin', 'linux'];

const core = [];
const check = (name, ok, detail = '') => { core.push({ name, ok: Boolean(ok), detail }); return ok; };

const major = Number(process.versions.node.split('.')[0]);
check('Node.js 24 or newer', major >= 24, process.version);
check('Dependencies installed', existsSync(path.join(root, 'node_modules', 'typescript')), 'run npm ci if this fails');
if (core.every(item => item.ok)) {
  check('TypeScript type check', run('npm', ['exec', '--', 'tsc', '--noEmit'], { stdio: 'inherit' }).status === 0);
  if (pkg.scripts?.test) check('Test suite', run('npm', ['test'], { stdio: 'inherit' }).status === 0);
}

const cargo = { name: 'Rust (cargo)', ok: () => available('cargo') };
const targets = [
  { id: 'web', host: null, needs: [] },
  { id: 'windows', host: 'win32', needs: [cargo] },
  { id: 'macos', host: 'darwin', needs: [cargo, { name: 'Xcode command-line tools', ok: () => available('xcode-select', ['-p']) }] },
  { id: 'linux', host: 'linux', needs: [cargo, { name: 'WebKitGTK 4.1 (pkg-config)', ok: () => available('pkg-config', ['--exists', 'webkit2gtk-4.1']) }] },
  { id: 'ios', host: 'darwin', needs: [{ name: 'Xcode', ok: () => available('xcodebuild', ['-version']) }, cargo, { name: 'Rust target aarch64-apple-ios', ok: () => rustTarget('aarch64-apple-ios') }] },
  { id: 'android', host: null, needs: [{ name: 'Java (JDK)', ok: () => available('java', ['-version']) }, { name: 'Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT)', ok: () => Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) }, cargo, { name: 'Rust target aarch64-linux-android', ok: () => rustTarget('aarch64-linux-android') }] },
  { id: 'steam', host: 'desktop', integration: true, needs: [{ name: 'Steamworks SDK in vendor/steamworks/sdk (see docs/integrations/steam.md)', ok: () => existsSync(path.join(root, 'vendor', 'steamworks', 'sdk', 'public', 'steam')) }] },
];

function statusOf(target) {
  const hostOk = target.host === null || (target.host === 'desktop' ? desktopHosts.includes(host) : target.host === host);
  if (!hostOk) return { status: 'not-verifiable-here', detail: `needs a ${target.host} machine; run npm run doctor there` };
  if (!core.every(item => item.ok)) return { status: 'blocked', detail: 'core checks failed' };
  const missing = target.needs.filter(need => !need.ok()).map(need => need.name);
  if (missing.length) return { status: 'missing', detail: missing.join('; ') };
  return { status: 'ready', detail: 'prerequisites found; the build itself has not been run' };
}

const report = {
  generatedAt: new Date().toISOString(),
  host,
  node: process.version,
  core,
  targets: targets.map(target => ({ id: target.id, ...statusOf(target) })),
};
mkdirSync(path.join(root, 'Builds'), { recursive: true });
writeFileSync(path.join(root, 'Builds', 'support-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log('\nCore checks');
for (const item of core) console.log(`  ${item.ok ? 'ok     ' : 'FAILED '} ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
console.log('\nTargets on this machine');
for (const target of report.targets) console.log(`  ${target.id.padEnd(8)} ${target.status.padEnd(20)} ${target.detail}`);
console.log('\nReport written to Builds/support-report.json');
process.exitCode = core.every(item => item.ok) ? 0 : 1;
