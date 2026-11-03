import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { access, readFile, mkdir, writeFile, readdir, cp, stat, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

export const platforms = ['web', 'windows', 'macos', 'linux', 'android', 'ios'];
const hosts = { windows: 'win32', macos: 'darwin', linux: 'linux', ios: 'darwin' };
export function validateProfile(value) {
  if (!value || !platforms.includes(value.platform) || !['development', 'release'].includes(value.mode)) throw new Error('Invalid platform or build mode');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('App name must be 1–80 characters');
  if (!/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error('Use a version such as 1.0.0');
  if (!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){1,}$/.test(value.identifier)) throw new Error('Use a bundle identifier such as com.studio.game');
  return { platform: value.platform, mode: value.mode, name: value.name.trim(), version: value.version, identifier: value.identifier };
}
export const profileId = profile => `${profile.platform}-${profile.mode}`;
export async function projectInfo(root) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  let config = {};
  try { config = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')); } catch {}
  let profiles = {};
  try { profiles = JSON.parse(await readFile(path.join(root, 'export-profiles.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read export-profiles.json; fix or restore it before continuing'); }
  for (const platform of platforms) for (const mode of ['development', 'release']) {
    const id = `${platform}-${mode}`;
    profiles[id] = validateProfile(profiles[id] ?? { platform, mode, name: config.productName || pkg.name, version: config.version || pkg.version || '0.1.0', identifier: config.identifier || 'com.example.game' });
    if (profileId(profiles[id]) !== id) throw new Error(`Mismatched profile: ${id}`);
  }
  return { name: config.productName || pkg.name, root, host: process.platform, kind: pkg.name === 'gameframework' ? 'framework' : 'game', hasTests: Boolean(pkg.scripts?.test), profiles };
}
export async function saveProfile(root, profile) {
  const info = await projectInfo(root); const value = validateProfile(profile);
  info.profiles[profileId(value)] = value;
  const file = path.join(root, 'export-profiles.json');
  const temporary = path.join(root, `.export-profiles.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(info.profiles, null, 2) + '\n');
  await rename(temporary, file);
  return value;
}
function tool(root, name) {
  const parts = name.split('/'); const count = name.startsWith('@') ? 2 : 1;
  const pkg = parts.slice(0, count).join('/');
  return path.join(path.dirname(createRequire(path.join(root, 'package.json')).resolve(`${pkg}/package.json`)), ...parts.slice(count));
}
/** npm is run through the same Node that started the dashboard when possible, so it works without a shell on every OS. */
function npmStep(args) {
  const cli = process.env.npm_execpath;
  if (cli && cli.endsWith('.js')) return { command: process.execPath, args: [cli, ...args], shell: false };
  return process.platform === 'win32' ? { command: 'npm.cmd', args, shell: true } : { command: 'npm', args, shell: false };
}
export function buildPlan(root, profile, action, host = process.platform) {
  const p = validateProfile(profile);
  if (!['build', 'run', 'dev', 'initialize', 'open', 'install', 'test'].includes(action)) throw new Error('Unknown export action');
  if (action === 'install') return [{ ...npmStep(['install']), title: 'Install dependencies' }];
  if (action === 'test') {
    if (!JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test) throw new Error('This project has no tests.');
    return [{ ...npmStep(['test']), title: 'Run tests' }];
  }
  if (action === 'dev' && p.platform !== 'web') throw new Error('Run Dev Server is only available for web');
  if (hosts[p.platform] && hosts[p.platform] !== host) throw new Error(`Build ${p.platform} on ${hosts[p.platform] === 'darwin' ? 'a Mac' : hosts[p.platform] === 'win32' ? 'Windows' : 'Linux'}. Cross-compilation is not configured.`);
  if (p.platform === 'web') {
    if (['initialize', 'open'].includes(action)) throw new Error('Web builds do not have a native project');
    if (action === 'dev') return [{ command: process.execPath, args: [tool(root, 'vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort', '--mode', 'development'], title: 'Run Vite dev server with live updates (no export build)' }];
    return [
      { command: process.execPath, args: [tool(root, 'typescript/bin/tsc'), '--noEmit'], title: 'Check TypeScript' },
      { command: process.execPath, args: [tool(root, 'vite/bin/vite.js'), 'build', '--mode', p.mode === 'development' ? 'development' : 'production'], title: 'Build web assets' }
    ];
  }
  const cli = tool(root, '@tauri-apps/cli/tauri.js');
  const config = JSON.stringify({ productName: p.name, version: p.version, identifier: p.identifier });
  const mobile = ['android', 'ios'].includes(p.platform);
  if (!mobile && ['initialize', 'open'].includes(action)) throw new Error('Native project actions apply to Android and iOS');
  if (mobile && action === 'initialize') return [{ command: process.execPath, args: [cli, p.platform, 'init', '--ci', '--config', config], title: `Initialize ${p.platform} project` }];
  if (mobile && action === 'open') {
    const directory = path.join(root, 'src-tauri', 'gen', p.platform === 'ios' ? 'apple' : 'android');
    if (p.platform === 'ios') {
      let project;
      try { project = readdirSync(directory).find(name => name.endsWith('.xcodeproj')); } catch { /* not initialized yet */ }
      if (!project) throw new Error('Set up the iOS project first.');
      return [{ command: 'open', args: [path.join(directory, project)], title: 'Open the iOS project in Xcode' }];
    }
    const opener = { darwin: 'open', win32: 'explorer.exe' }[host] ?? 'xdg-open';
    return [{ command: opener, args: [directory], title: 'Open the Android project folder (then choose File › Open in Android Studio)' }];
  }
  if (p.platform === 'ios') throw new Error('Initialize and open the Xcode project to build on a simulator. Automated iOS archives require signing configuration, which is not set up here.');
  if (p.platform === 'android' && p.mode === 'release') throw new Error('Android release signing is not configured. Use a development APK or open Android Studio for release setup.');
  const args = [cli, ...(mobile ? [p.platform] : []), action === 'run' && p.mode === 'development' ? 'dev' : 'build'];
  if (args.at(-1) === 'build') args.push(...(p.mode === 'development' ? ['--debug'] : []), ...(mobile ? ['--apk'] : ['--no-sign']));
  args.push('--config', config);
  return [{ command: process.execPath, args, title: action === 'run' && p.mode === 'development' ? 'Run development build (stop to end session)' : 'Build native application' }];
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function version(command, args) {
  return new Promise(resolve => {
    let output = ''; let settled = false;
    const done = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const timer = setTimeout(() => { child.kill(); done(undefined); }, 5000);
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', () => done(undefined)); child.on('close', code => done(code === 0 ? output.trim().split('\n')[0] : undefined));
  });
}
async function steamCheck(root) {
  const sdk = await exists(path.join(root, 'vendor/steamworks/sdk/public/steam'));
  return { checks: [{ name: 'Steamworks SDK', ok: sdk, detail: sdk ? 'Found in vendor/steamworks/sdk' : 'Download the SDK from the Steamworks site and place it in vendor/steamworks/sdk. Steps: docs/integrations/steam.md', blocking: true }], ready: sdk, note: 'Uploads to Steam are not automated yet.' };
}
export async function checkPlatform(root, platform, host = process.platform, action = 'build') {
  if (platform === 'steam') return steamCheck(root);
  if (!platforms.includes(platform)) throw new Error('Unknown platform');
  const checks = [];
  const add = (name, ok, detail, blocking = true) => checks.push({ name, ok, detail, blocking });
  const hostNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  add('Build host', !hosts[platform] || hosts[platform] === host, `Current machine: ${hostNames[host] || host}${hosts[platform] ? ` · required: ${hostNames[hosts[platform]]}` : ''}`);
  for (const pkg of [...(action === 'dev' ? [] : ['typescript/bin/tsc']), 'vite/bin/vite.js', ...(platform === 'web' ? [] : ['@tauri-apps/cli/tauri.js'])]) {
    const name = { 'typescript/bin/tsc': 'TypeScript', 'vite/bin/vite.js': 'Vite', '@tauri-apps/cli/tauri.js': 'Tauri CLI' }[pkg];
    try { tool(root, pkg); add(name, true, 'Installed'); } catch { add(name, false, 'Use Install dependencies to set this up'); }
  }
  if (platform !== 'web') {
    const rust = await version('rustc', ['--version']); add('Rust toolchain', !!rust, rust || 'Install Rust: run "curl https://sh.rustup.rs -sSf | sh" (or see rustup.rs), then reopen the terminal');
    add('Tauri configuration', await exists(path.join(root, 'src-tauri/tauri.conf.json')), 'src-tauri/tauri.conf.json');
  }
  if (platform === 'windows' && host === 'win32') {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
    const msvc = await version(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']);
    add('MSVC build tools', !!msvc, msvc || 'Install Visual Studio Build Tools with the "Desktop development with C++" workload');
  }
  if (platform === 'linux' && host === 'linux') {
    const webkit = await version('pkg-config', ['--modversion', 'webkit2gtk-4.1']);
    add('WebKitGTK', !!webkit, webkit || 'Install the WebKitGTK 4.1 dev package (e.g. sudo apt install libwebkit2gtk-4.1-dev)');
  }
  if (platform === 'android') {
    const java = await version('java', ['-version']); add('Java', !!java, java || 'Install a JDK (17 or newer) and set JAVA_HOME to it');
    add('Android SDK', !!process.env.ANDROID_HOME && await exists(process.env.ANDROID_HOME), process.env.ANDROID_HOME || 'Install Android Studio, then set ANDROID_HOME to its SDK folder (usually ~/Library/Android/sdk)');
    add('Android NDK', !!process.env.NDK_HOME && await exists(process.env.NDK_HOME), process.env.NDK_HOME || 'In Android Studio: SDK Manager → SDK Tools → NDK (Side by side), then set NDK_HOME to it');
  }
  if (['ios', 'macos'].includes(platform) && host === 'darwin') {
    const xcode = await version('xcode-select', ['-p']); add('Apple build tools', !!xcode, xcode || 'Install Xcode from the App Store, then run "xcode-select --install"');
    if (platform === 'ios') { const pods = await version('pod', ['--version']); add('CocoaPods', !!pods, pods || 'Install CocoaPods: run "sudo gem install cocoapods" (or "brew install cocoapods"), then Re-check'); }
  }
  if (['android', 'ios'].includes(platform)) add('Native project', await exists(path.join(root, `src-tauri/gen/${platform === 'ios' ? 'apple' : 'android'}`)), platform === 'ios' ? 'Created once in src-tauri/gen/apple. Edits you make in Xcode live there, so commit that folder to Git. Deleting it means Set up creates it again from scratch.' : 'Created once in src-tauri/gen/android. Edits you make in Android Studio live there, so commit that folder to Git. Deleting it means Set up creates it again from scratch.', false);
  return { checks, ready: checks.every(check => check.ok || !check.blocking), note: 'Checks detect common prerequisites. Platform SDK components and Rust target availability are verified by the native build tools.' };
}
export async function nativeProjectExists(root, platform) { return exists(path.join(root, `src-tauri/gen/${platform === 'ios' ? 'apple' : 'android'}`)); }
export function cancelChild(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true }).on('error', () => child.kill());
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}
export async function runStep(step, root, job, log) {
  log(`\n› ${step.title}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { cwd: root, shell: step.shell === true, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, NO_COLOR: '1' } });
    job.child = child;
    child.stdout.on('data', data => log(data.toString())); child.stderr.on('data', data => log(data.toString()));
    child.on('error', reject); child.on('close', code => { job.child = undefined; code === 0 && !job.cancelled ? resolve() : reject(new Error(job.cancelled ? 'Cancelled' : `${step.title} failed (exit ${code})`)); });
  });
}
async function findArtifacts(directory, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.name.endsWith('.app') && entry.isDirectory()) results.push(file);
    else if (entry.isDirectory()) await findArtifacts(file, results);
    else if (/\.(exe|msi|dmg|deb|rpm|AppImage|apk|aab|ipa)$/i.test(entry.name)) results.push(file);
  }
  return results;
}
export async function collectArtifacts(root, profile, job) {
  const directory = path.join(root, 'Builds', profile.platform, profile.mode, job.id);
  let runnable;
  await mkdir(directory, { recursive: true });
  if (profile.platform === 'web') {
    await cp(path.join(root, 'dist'), path.join(directory, 'web'), { recursive: true, dereference: false, verbatimSymlinks: true });
  } else {
    const nativeRoot = path.join(root, 'src-tauri/target', profile.mode === 'development' ? 'debug' : 'release');
    const files = await findArtifacts(profile.platform === 'android' ? path.join(root, 'src-tauri/gen/android/app/build/outputs') : path.join(nativeRoot, 'bundle'));
    for (const file of files) {
      if ((await stat(file)).mtimeMs < Date.parse(job.started) - 2000) continue;
      const name = path.basename(file); await cp(file, path.join(directory, name), { recursive: true, verbatimSymlinks: true });
    }
    // Keep the runnable host binary too, including Linux binaries without extensions.
    const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
    const name = cargo.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    if (name && profile.platform !== 'android') {
      const file = path.join(nativeRoot, name + (profile.platform === 'windows' ? '.exe' : ''));
      if (await exists(file)) { const destination = path.join(directory, path.basename(file)); await cp(file, destination); runnable = path.relative(root, destination); }
    }
  }
  const artifacts = [];
  for (const name of await readdir(directory)) { const file = path.join(directory, name); const info = await stat(file); artifacts.push({ name, directory: info.isDirectory(), bytes: info.size, path: path.relative(root, file).replaceAll('\\', '/') }); }
  await writeFile(path.join(directory, 'build-report.json'), JSON.stringify({ profile, started: job.started, finished: new Date().toISOString(), artifacts }, null, 2));
  return { directory: path.relative(root, directory).replaceAll('\\', '/'), artifacts, runnable };
}
