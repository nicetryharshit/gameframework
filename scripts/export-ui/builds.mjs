import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { access, readFile, mkdir, writeFile, readdir, cp, stat, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readSteamSettings, readSteamSettingsSync, RUNTIME_LIBRARY, SDK_FOLDER, steamAppIdStep, steamChecks, steamFeatureDeclared, steamRuntimeStep, steamUsesSteam } from './steam.mjs';

export const platforms = ['web', 'windows', 'macos', 'linux', 'android', 'ios'];
const hosts = { windows: 'win32', macos: 'darwin', linux: 'linux', ios: 'darwin' };
const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){1,}$/;
/** The default bundle identifier for a game: com.game.<gameName>, lowercase letters and digits only. */
export function defaultIdentifier(gameName) {
  const slug = String(gameName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `com.game.${slug || 'game'}`;
}
/**
 * iOS-only settings, applied when the Xcode project is created. Each one is optional:
 * an empty value falls back to the game name (app name), com.game.<gameName> (identifier), or Tauri's default (minimum version).
 */
export function validateIosSettings(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('iOS settings must be an object');
  const out = {};
  const text = (key, max) => { const v = value[key]; if (v === undefined || v === null || String(v).trim() === '') return; const t = String(v).trim(); if (t.length > max) throw new Error(`Keep ${key} to ${max} characters`); out[key] = t; };
  text('displayName', 80);
  if (value.identifier) { const id = String(value.identifier).trim(); if (!IDENTIFIER.test(id)) throw new Error('iOS bundle identifier must look like com.studio.game'); out.identifier = id; }
  if (value.buildNumber) { const b = String(value.buildNumber).trim(); if (!/^\d+(\.\d+){0,2}$/.test(b)) throw new Error('Build number must be a whole number such as 1, or 1.2.3'); out.buildNumber = b; }
  if (value.minimumVersion) { const m = String(value.minimumVersion).trim(); if (!/^\d+(\.\d+)?$/.test(m)) throw new Error('Minimum iOS version must look like 15.0'); out.minimumVersion = m; }
  return Object.keys(out).length ? out : undefined;
}
export function validateProfile(value) {
  if (!value || !platforms.includes(value.platform) || !['development', 'release'].includes(value.mode)) throw new Error('Invalid platform or build mode');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('App name must be 1–80 characters');
  if (!/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error('Use a version such as 1.0.0');
  if (!IDENTIFIER.test(value.identifier)) throw new Error('Use a bundle identifier such as com.studio.game');
  const ios = value.platform === 'ios' ? validateIosSettings(value.ios) : undefined;
  return { platform: value.platform, mode: value.mode, name: value.name.trim(), version: value.version, identifier: value.identifier, ...(ios ? { ios } : {}) };
}
/** The configuration passed to `tauri <platform> init`. Only set values are sent, so Tauri's defaults still apply. */
export function initConfig(profile) {
  const config = { productName: profile.name, version: profile.version, identifier: profile.identifier };
  if (profile.platform === 'ios' && profile.ios) {
    const { displayName, identifier, buildNumber, minimumVersion } = profile.ios;
    if (displayName) config.productName = displayName;
    if (identifier) config.identifier = identifier;
    const iOS = {};
    if (buildNumber) iOS.bundleVersion = buildNumber;
    if (minimumVersion) iOS.minimumSystemVersion = minimumVersion;
    if (Object.keys(iOS).length) config.bundle = { iOS };
  }
  return config;
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
    profiles[id] = validateProfile(profiles[id] ?? { platform, mode, name: config.productName || pkg.name, version: config.version || pkg.version || '0.1.0', identifier: config.identifier || defaultIdentifier(config.productName || pkg.name) });
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
  const config = JSON.stringify(initConfig(p));
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
  const settings = readSteamSettingsSync(root);
  const steam = steamUsesSteam(p.platform, settings) ? steamBuild(root, settings) : undefined;
  const args = [cli, ...(mobile ? [p.platform] : []), action === 'run' && p.mode === 'development' ? 'dev' : 'build'];
  if (args.at(-1) === 'build') args.push(...(p.mode === 'development' ? ['--debug'] : []), ...(mobile ? ['--apk'] : ['--no-sign']));
  if (steam) args.push('--features', 'steam');
  // A Windows installer must carry the Steam runtime library, or players hit the missing-DLL error on start-up.
  const installerNeedsSteam = steam && p.platform === 'windows' && args.includes('build');
  const installerConfig = installerNeedsSteam
    ? { ...initConfig(p), bundle: { resources: { [`../vendor/steamworks/sdk/redistributable_bin/${RUNTIME_LIBRARY.windows.replaceAll('\\', '/')}`]: './' } } }
    : undefined;
  args.push('--config', installerConfig ? JSON.stringify(installerConfig) : config);
  const steps = [];
  // Steam recognises a local development run only when steam_appid.txt sits next to the app. Release builds never get it.
  if (steam && p.mode === 'development') {
    steps.push(steamAppIdStep(root, steam.appId));
    const runtime = steamRuntimeStep(root, p.platform);
    if (runtime) steps.push(runtime);
  }
  // Debug builds tell the game's page it is a debug build, so debug-only tools such as the Steam test panel are included.
  // Tauri runs the web build itself (beforeBuildCommand), and it inherits this variable.
  const env = p.mode === 'development' ? { VITE_GAME_DEBUG_BUILD: '1' } : undefined;
  steps.push({ command: process.execPath, args, title: action === 'run' && p.mode === 'development' ? 'Run development build (stop to end session)' : 'Build native application', ...(env ? { env } : {}) });
  return steps;
}
/** The Steam settings a desktop build needs, or a clear reason it cannot include Steam yet. */
function steamBuild(root, settings) {
  if (!settings.appId) throw new Error('Enter your Steam App ID on the Steam page, or turn off Build with Steam.');
  let cargo = '';
  try { cargo = readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'); } catch { /* checked below */ }
  if (!steamFeatureDeclared(cargo)) throw new Error('This game has no Steam feature in src-tauri/Cargo.toml. Update tools from the framework, then try again.');
  return { appId: settings.appId };
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
/** Full stdout of a command, or undefined if it cannot run. */
async function output(command, args) {
  return new Promise(resolve => {
    let text = ''; let settled = false;
    const done = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const timer = setTimeout(() => { child.kill(); done(undefined); }, 10000);
    child.stdout.on('data', data => { text += data; }); child.stderr.on('data', () => {});
    child.on('error', () => done(undefined)); child.on('close', code => done(code === 0 ? text : undefined));
  });
}
const MOBILE_TARGETS = {
  ios: ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios'],
  android: ['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']
};
/** Tauri's mobile setup runs `rustup target add`, so rustup and the mobile targets must both be present. */
async function rustupChecks(platform, add) {
  const rustup = await version('rustup', ['--version']);
  const note = 'Start Game Workshop from a terminal, or add ~/.cargo/bin to your PATH, if rustup is installed elsewhere.';
  add('rustup', !!rustup, rustup || `rustup was not found. Install it from rustup.rs. ${note}`);
  if (!rustup) return;
  const installed = (await output('rustup', ['target', 'list', '--installed'])) ?? '';
  const wanted = MOBILE_TARGETS[platform] ?? [];
  const missing = wanted.filter(target => !installed.split('\n').includes(target));
  add('Rust mobile targets', missing.length === 0, missing.length ? `Run: rustup target add ${missing.join(' ')}` : `${wanted.length} installed`);
}

async function steamCheck(root) {
  const checks = await steamChecks(root, await readSteamSettings(root));
  return { checks, ready: checks.every(check => check.ok || !check.blocking), note: 'Uploads to Steam are not automated yet.' };
}
export async function checkPlatform(root, platform, host = process.platform, action = 'build') {
  if (platform === 'steam') return steamCheck(root);
  if (!platforms.includes(platform)) throw new Error('Unknown platform');
  const checks = [];
  const add = (name, ok, detail, blocking = true) => checks.push({ name, ok, detail, blocking });
  const hostNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  add('Build host', !hosts[platform] || hosts[platform] === host, `Current machine: ${hostNames[host] || host}${hosts[platform] ? ` · required: ${hostNames[hosts[platform]]}` : ''}`);
  // A generated game also checks that its renderers, physics engines and imports agree (see wiring-check.mjs).
  if (await exists(path.join(root, 'tools/gameframework/VERSION.json'))) {
    const wiring = await import('../wiring-check.mjs').catch(() => undefined);
    if (wiring) checks.push(...await wiring.wiringChecks(root));
    else add('Game wiring', true, 'Update tools to turn on the wiring check.', false);
  }
  for (const pkg of [...(action === 'dev' ? [] : ['typescript/bin/tsc']), 'vite/bin/vite.js', ...(platform === 'web' ? [] : ['@tauri-apps/cli/tauri.js'])]) {
    const name = { 'typescript/bin/tsc': 'TypeScript', 'vite/bin/vite.js': 'Vite', '@tauri-apps/cli/tauri.js': 'Tauri CLI' }[pkg];
    try { tool(root, pkg); add(name, true, 'Installed'); } catch { add(name, false, 'Use Install dependencies to set this up'); }
  }
  if (platform !== 'web') {
    const rust = await version('rustc', ['--version']); add('Rust toolchain', !!rust, rust || 'Install Rust: run "curl https://sh.rustup.rs -sSf | sh" (or see rustup.rs), then reopen the terminal');
    add('Tauri configuration', await exists(path.join(root, 'src-tauri/tauri.conf.json')), 'src-tauri/tauri.conf.json');
    if (MOBILE_TARGETS[platform]) await rustupChecks(platform, add);
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
  const steamSettings = await readSteamSettings(root);
  if (steamUsesSteam(platform, steamSettings)) checks.push(...await steamChecks(root, steamSettings));
  return { checks, ready: checks.every(check => check.ok || !check.blocking), note: 'Checks detect common prerequisites. Platform SDK components and Rust target availability are verified by the native build tools.' };
}
/**
 * The Xcode build settings that Game Workshop owns, and the value each comes from.
 * Everything else in the project (capabilities, signing choices, your own edits) is left as it is.
 */
export function iosBuildSettings(profile) {
  const ios = profile.ios ?? {};
  const settings = {
    PRODUCT_BUNDLE_IDENTIFIER: ios.identifier || profile.identifier,
    PRODUCT_NAME: ios.displayName || profile.name,
    MARKETING_VERSION: profile.version,
    IPHONEOS_DEPLOYMENT_TARGET: ios.minimumVersion || '15.0'
  };
  if (ios.buildNumber) settings.CURRENT_PROJECT_VERSION = ios.buildNumber;
  return settings;
}

/**
 * Rewrites those settings inside the existing project, in place. Works on the Xcode project file and on
 * XcodeGen's project.yml, whichever exists. Only values Game Workshop owns are changed, and only where the key already exists.
 * Returns the keys it changed, so the dashboard can say what happened. Keys missing from the project are reported, not invented.
 */
export async function updateIosProject(root, profile) {
  const base = path.join(root, 'src-tauri', 'gen', 'apple');
  const files = [];
  try { for (const name of readdirSync(base)) { if (name.endsWith('.xcodeproj')) files.push(path.join(base, name, 'project.pbxproj')); } } catch { /* not generated yet */ }
  files.push(path.join(base, 'project.yml'));
  const wanted = iosBuildSettings(profile);
  const changed = new Set(); const touched = []; const missing = new Set(Object.keys(wanted));
  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    touched.push(path.relative(root, file));
    let next = text;
    for (const [key, value] of Object.entries(wanted)) {
      // Matches `KEY = value;` (Xcode) and `KEY: value` (project.yml). A quoted value keeps its quotes.
      const pattern = new RegExp(`(\\b${key}[ \\t]*[=:][ \\t]*)("[^"\\n]*"|[^;\\n]*?)([ \\t]*;?[ \\t]*)$`, 'gm');
      if (!pattern.test(next)) continue;
      pattern.lastIndex = 0;
      next = next.replace(pattern, (match, prefix, current, tail) => {
        missing.delete(key);
        const replacement = current.startsWith('"') ? `"${value}"` : value;
        if (current !== replacement) changed.add(key);
        return `${prefix}${replacement}${tail}`;
      });
    }
    if (next !== text) await writeFile(file, next);
  }
  return { files: touched, changed: [...changed], missing: [...missing] };
}

/**
 * Moves the Xcode project aside instead of deleting it, so regenerating is reversible.
 * Returns the backup's folder name, relative to src-tauri/gen.
 */
export async function moveIosProjectAside(root, now = new Date()) {
  const gen = path.join(root, 'src-tauri', 'gen');
  const from = path.join(gen, 'apple');
  if (!(await exists(from))) return undefined;
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const to = path.join(gen, `apple.backup-${stamp}`);
  await rename(from, to);
  return path.basename(to);
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
    const child = spawn(step.command, step.args, { cwd: root, shell: step.shell === true, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, NO_COLOR: '1', ...(step.env ?? {}) } });
    job.child = child;
    child.stdout.on('data', data => log(data.toString())); child.stderr.on('data', data => log(data.toString()));
    child.on('error', reject); child.on('close', code => { job.child = undefined; code === 0 && !job.cancelled ? resolve() : reject(new Error(job.cancelled ? 'Cancelled' : `${step.title} failed (exit ${code})`)); });
  });
}
/**
 * Removes packages left by earlier builds, so that what a build exports is only what it produced.
 * Compiled code in target/ is kept, so the next build stays fast. Web builds have nothing to clear.
 */
export async function clearPreviousOutput(root, profile) {
  if (profile.platform === 'web') return;
  const folders = profile.platform === 'android'
    ? [path.join(root, 'src-tauri/gen/android/app/build/outputs/apk'), path.join(root, 'src-tauri/gen/android/app/build/outputs/bundle')]
    : [path.join(root, 'src-tauri/target', profile.mode === 'development' ? 'debug' : 'release', 'bundle')];
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
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
      const name = path.basename(file); await cp(file, path.join(directory, name), { recursive: true, verbatimSymlinks: true });
    }
    // Keep the runnable host binary too, including Linux binaries without extensions.
    const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
    const name = cargo.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    if (name && profile.platform !== 'android') {
      const file = path.join(nativeRoot, name + (profile.platform === 'windows' ? '.exe' : ''));
      if (await exists(file)) { const destination = path.join(directory, path.basename(file)); await cp(file, destination); runnable = path.relative(root, destination); }
    }
    // A Steam build loads its runtime library at start-up, so it must sit next to the program in the Builds folder.
    if (steamUsesSteam(profile.platform, readSteamSettingsSync(root)) && RUNTIME_LIBRARY[profile.platform]) {
      const library = path.join(root, SDK_FOLDER, 'redistributable_bin', RUNTIME_LIBRARY[profile.platform]);
      if (await exists(library)) await cp(library, path.join(directory, path.basename(library)));
    }
  }
  const artifacts = [];
  for (const name of await readdir(directory)) { const file = path.join(directory, name); const info = await stat(file); artifacts.push({ name, directory: info.isDirectory(), bytes: info.size, path: path.relative(root, file).replaceAll('\\', '/') }); }
  await writeFile(path.join(directory, 'build-report.json'), JSON.stringify({ profile, started: job.started, finished: new Date().toISOString(), artifacts }, null, 2));
  if (!artifacts.length) throw new Error(`The build finished but produced no output for ${path.relative(root, directory).replaceAll('\\', '/')}. Check the build log for where the package was written.`);
  return { directory: path.relative(root, directory).replaceAll('\\', '/'), artifacts, runnable };
}
