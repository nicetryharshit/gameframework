#!/usr/bin/env node
import { access, chmod, cp, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = 'tools/gameframework';
// Framework files a game needs to run, build and open the Build dashboard without this checkout.
// Each component can be updated on its own, so a game can take new renderers without taking a new dashboard.
export const COMPONENTS = [
  { id: 'framework', label: 'Core framework', note: 'Events, UI, state, input', files: ['src/framework'] },
  { id: 'renderers', label: 'Renderers', note: 'Pixi, Three and any added since', files: ['src/renderers'] },
  { id: 'platform', label: 'Platform layer', note: 'Desktop and mobile hooks', files: ['src/platform'] },
  { id: 'workshop', label: 'Workshop dashboard', note: 'This dashboard, the doctor check and the example remover', files: ['scripts/export-ui', 'scripts/doctor.mjs', 'scripts/create-game.mjs'] },
  { id: 'docs', label: 'Docs', note: 'Framework documentation', files: ['docs'] }
];
const frameworkFiles = COMPONENTS.flatMap(component => component.files);

async function walk(file, relative, out) {
  const info = await stat(file).catch(() => undefined);
  if (!info) return;
  if (info.isDirectory()) {
    for (const entry of (await readdir(file)).sort()) if (entry !== '.DS_Store') await walk(path.join(file, entry), `${relative}/${entry}`, out);
  } else out.push([relative, file]);
}
/** A content hash of a component's files under a root, or undefined when none exist. */
export async function hashComponent(root, component) {
  const found = [];
  for (const item of component.files) await walk(path.join(root, item), item, found);
  if (!found.length) return undefined;
  const hash = createHash('sha256');
  for (const [relative, file] of found) hash.update(relative).update('\0').update(await readFile(file)).update('\0');
  return hash.digest('hex').slice(0, 12);
}
const revisionOf = hashes => createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0, 6);
async function hashesFor(root) {
  return Object.fromEntries(await Promise.all(COMPONENTS.map(async component => [component.id, await hashComponent(root, component)])));
}

/** Renderers the framework offers, from src/renderers/registry.json under a framework or tools folder. */
export async function readRegistry(root) {
  const text = await readFile(path.join(root, 'src/renderers/registry.json'), 'utf8').catch(() => '{"renderers":[]}');
  return JSON.parse(text).renderers;
}
const aliasOf = entry => `gameframework/${entry.id}`;

/**
 * Config edits that map each renderer in the framework's registry. Nothing is written here: the caller applies the edits
 * with the update, so a failure undoes them. Malformed JSON throws before anything in the game changes.
 */
async function planRendererWiring(target) {
  const notes = [];
  const edits = [];
  const registry = await readRegistry(source);
  const tsFile = path.join(target, 'tsconfig.json');
  const tsconfig = JSON.parse(await readFile(tsFile, 'utf8').catch(() => 'null'));
  if (!tsconfig?.compilerOptions) notes.push('tsconfig.json was not found or has no compilerOptions. Add the renderer paths by hand.');
  else {
    const paths = tsconfig.compilerOptions.paths ??= {};
    let changed = false;
    for (const entry of registry) if (!paths[aliasOf(entry)]) { paths[aliasOf(entry)] = [`./${tools}/src/renderers/${entry.entry}`]; changed = true; }
    if (changed) edits.push({ path: 'tsconfig.json', text: JSON.stringify(tsconfig, null, 2) + '\n' });
  }
  const viteFile = path.join(target, 'vite.config.ts');
  let vite = await readFile(viteFile, 'utf8').catch(() => undefined);
  const missing = registry.filter(entry => !(vite ?? '').includes(`'${aliasOf(entry)}'`));
  if (vite === undefined) notes.push('vite.config.ts was not found. Add the renderer aliases by hand.');
  else if (missing.length) {
    const marker = /^(\s*)alias:\s*\[\s*$/m.exec(vite);
    if (!marker) notes.push(`Could not edit vite.config.ts. Add ${missing.map(entry => `{ find: '${aliasOf(entry)}', replacement: framework('src/renderers/${entry.entry}') }`).join(', ')} to resolve.alias.`);
    else {
      const lines = missing.map(entry => `${marker[1]}  { find: '${aliasOf(entry)}', replacement: framework('src/renderers/${entry.entry}') },`).join('\n');
      vite = vite.replace(marker[0], `${marker[0]}\n${lines}`);
      edits.push({ path: 'vite.config.ts', text: vite });
    }
  }
  return { notes, edits };
}

/** Each framework renderer with this game's state: ready (mapped, packages present) or available. */
async function rendererStates(target) {
  const registry = await readRegistry(source);
  const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8').catch(() => '{}'));
  const have = { ...pkg.dependencies, ...pkg.devDependencies };
  const tsconfig = JSON.parse(await readFile(path.join(target, 'tsconfig.json'), 'utf8').catch(() => '{}'));
  const mapped = tsconfig.compilerOptions?.paths ?? {};
  const copied = await readRegistry(path.join(target, tools));
  return registry.map(entry => {
    const needs = [...entry.packages, ...(entry.devPackages ?? [])];
    const installed = needs.every(name => have[name]);
    const wired = !!mapped[aliasOf(entry)] && copied.some(item => item.id === entry.id);
    return { id: entry.id, label: entry.label, kind: entry.kind, note: entry.note, status: wired && installed ? 'ready' : 'available' };
  });
}

/**
 * Adds a renderer to an existing game in one step: copies the framework's renderers, maps the alias,
 * and adds its packages to package.json. All of it is applied together, so a failure leaves the game as it was.
 * It does not run npm; the dashboard's Install dependencies does.
 */
export async function addRenderer(directory, id) {
  return lockedGame(directory, async target => {
    await statusOf(target);
    const entry = (await readRegistry(source)).find(item => item.id === id);
    if (!entry) throw new Error(`Unknown renderer: ${id}`);
    const renderers = COMPONENTS.find(component => component.id === 'renderers');
    const copied = await readRegistry(path.join(target, tools));
    const items = [];
    if (!copied.some(item => item.id === id) || !(await exists(path.join(target, tools, 'src/renderers', entry.entry)))) {
      const versionFile = path.join(target, tools, 'VERSION.json');
      const meta = JSON.parse(await readFile(versionFile, 'utf8'));
      meta.components = { ...meta.components, renderers: (await frameworkVersion()).hashes.renderers };
      items.push(...renderers.files.map(item => ({ path: `${tools}/${item}`, from: path.join(source, item) })));
      items.push({ path: `${tools}/VERSION.json`, text: JSON.stringify(meta, null, 2) + '\n' });
    }
    const wiring = await planRendererWiring(target);
    const own = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    const pkgFile = path.join(target, 'package.json');
    const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
    const added = [];
    for (const [list, field] of [[entry.packages, 'dependencies'], [entry.devPackages ?? [], 'devDependencies']]) {
      for (const name of list) {
        const version = own.dependencies?.[name] ?? own.devDependencies?.[name];
        if (!version) throw new Error(`The framework does not list a version for ${name}.`);
        if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) continue;
        (pkg[field] ??= {})[name] = version; added.push(name);
      }
    }
    if (added.length) {
      for (const field of ['dependencies', 'devDependencies']) if (pkg[field]) pkg[field] = Object.fromEntries(Object.entries(pkg[field]).sort(([a], [b]) => a.localeCompare(b)));
      items.push({ path: 'package.json', text: JSON.stringify(pkg, null, 2) + '\n' });
    }
    if (items.length || wiring.edits.length) await replaceItems(target, [...items, ...wiring.edits]);
    const notes = [...wiring.notes];
    if (added.length) notes.push(`Added ${added.join(', ')} to package.json. Run Install dependencies in the game before using it.`);
    notes.push(`Import it with: import { create${entry.id[0].toUpperCase()}${entry.id.slice(1)}Renderer } from '${aliasOf(entry)}'`);
    return { renderer: id, added, notes };
  });
}

/** The framework's own version and revision, shown next to each game's. */
export async function frameworkVersion() {
  const own = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const hashes = Object.fromEntries(await Promise.all(COMPONENTS.map(async component => [component.id, await hashComponent(source, component)])));
  return { version: own.version, revision: revisionOf(hashes), hashes };
}

/**
 * Compares a game's copy of each component with this framework's.
 * current: identical. outdated: the framework has changed. modified: the game's copy was edited by hand and would be overwritten.
 * missing: the game has none yet (a component added after the game was created).
 */
export async function inspectGame(directory) {
  return lockedGame(directory, statusOf);
}

/** The game's status as it is on disk. Callers hold the game's lock. */
async function statusOf(target) {
  const meta = JSON.parse(await readFile(path.join(target, tools, 'VERSION.json'), 'utf8').catch(() => { throw new Error('That folder is not a Game Workshop game.'); }));
  const framework = await frameworkVersion();
  const mine = await hashesFor(path.join(target, tools));
  const components = COMPONENTS.map(component => {
    const have = mine[component.id]; const want = framework.hashes[component.id]; const recorded = meta.components?.[component.id];
    const status = !have ? 'missing' : have === want ? 'current' : recorded && have !== recorded ? 'modified' : 'outdated';
    return { id: component.id, label: component.label, note: component.note, status };
  });
  return { version: meta.version, revision: revisionOf(mine), renderers: await rendererStates(target), framework: { version: framework.version, revision: framework.revision }, components, outdated: components.some(item => item.status !== 'current') };
}
const demoFiles = ['flappy.ts', 'demo.ts', 'demo-settings.ts', 'demo.css'];
const digest = text => createHash('sha256').update(text).digest('hex');

/** Game code imports the framework by package-style names, which the game's aliases resolve to the copied files. */
export function rewriteExample(text) {
  return text.replaceAll("from './framework'", "from 'gameframework'").replace(/from '\.\/renderers\/([a-z0-9-]+)'/g, "from 'gameframework/$1'").replaceAll("from './platform/desktop'", "from 'gameframework/desktop'");
}

/** SHA-256 of each example file as createGame writes it into a game. Recorded in VERSION.json as example.files. */
async function exampleHashesFor(entry) {
  const files = [...demoFiles, entry.demo];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, digest(rewriteExample(await readFile(path.join(source, 'src', file), 'utf8')))])));
}

/** Hash of an example file as the framework ships it now. Used for games made before hashes were recorded. */
async function frameworkExampleHash(file) {
  const text = await readFile(path.join(source, 'src', file), 'utf8').catch(() => undefined);
  return text === undefined ? undefined : digest(rewriteExample(text));
}

/**
 * What is left of the default example in a game. present: example files on disk. changed: example files the game
 * has edited, which removal refuses to delete. removable: something is left to remove and nothing was edited.
 */
async function exampleStatusOf(target) {
  const meta = JSON.parse(await readFile(path.join(target, tools, 'VERSION.json'), 'utf8').catch(() => '{}'));
  const renderer = await gameRenderer(target);
  const entry = (await readRegistry(source)).find(item => item.id === renderer);
  const files = [...demoFiles, ...(entry ? [entry.demo] : [])];
  const present = []; const changed = [];
  for (const file of files) {
    const current = await readFile(path.join(target, 'src', file), 'utf8').catch(() => undefined);
    if (current === undefined) continue;
    present.push(file);
    const expected = meta.example?.files?.[file] ?? await frameworkExampleHash(file);
    if (!expected || digest(current) !== expected) changed.push(file);
  }
  return { present, changed, removable: present.length > 0 && changed.length === 0 };
}

/** Read-only: the default example's state in a game folder, for the games page and the game's own dashboard. */
export async function exampleStatus(directory) {
  return exampleStatusOf(path.resolve(directory));
}

/**
 * Records the default example's hashes in a game made before they were recorded, when the example is unmodified.
 * After that the game can check and remove its example without the framework's example files. Returns true when it recorded.
 */
export async function recordExample(directory) {
  const target = path.resolve(directory);
  const before = JSON.parse(await readFile(path.join(target, tools, 'VERSION.json'), 'utf8').catch(() => '{}'));
  if (before.example) return false;
  return lockedGame(target, async locked => {
    const meta = JSON.parse(await readFile(path.join(locked, tools, 'VERSION.json'), 'utf8'));
    if (meta.example) return false;
    const status = await exampleStatusOf(locked);
    if (!status.removable) return false;
    const files = Object.fromEntries(await Promise.all(status.present.map(async file => [file, digest(await readFile(path.join(locked, 'src', file), 'utf8'))])));
    meta.example = { files };
    await replaceItems(locked, [{ path: `${tools}/VERSION.json`, text: JSON.stringify(meta, null, 2) + '\n' }]);
    return true;
  });
}

const starterFile = 'src/main.ts';
const starterCode = [
  '// Your game starts here. The default example was removed, so this file is the entry point.',
  "// The framework is available as 'gameframework' (see tools/gameframework/docs/FRAMEWORK.md).",
  "const app = document.querySelector<HTMLDivElement>('#app');",
  "if (app) app.textContent = 'Your game starts here.';",
  ''
].join('\n');
const starterHtml = name => `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`;

/**
 * Permanently deletes the default example from a game. Refused when the game has no example, or when the game edited any
 * example file (those edits are the user's work). The entry point becomes an empty starter. Game code, src-tauri,
 * profiles and builds are not touched.
 */
export async function removeExample(directory) {
  return lockedGame(directory, async target => {
    const status = await exampleStatusOf(target);
    if (!status.present.length) throw new Error('This game has no example to remove.');
    if (status.changed.length) throw new Error(`Not removed. You edited ${status.changed.join(', ')}, so those files are your code now. Delete them by hand if you no longer need them.`);
    if (await exists(path.join(target, starterFile))) throw new Error(`Not removed. ${starterFile} already exists and the starter would replace it.`);
    const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    const meta = JSON.parse(await readFile(path.join(target, tools, 'VERSION.json'), 'utf8'));
    delete meta.example;
    const items = [
      { path: starterFile, text: starterCode },
      { path: 'index.html', text: starterHtml(pkg.name) },
      { path: `${tools}/VERSION.json`, text: JSON.stringify(meta, null, 2) + '\n' }
    ];
    const readme = await readFile(path.join(target, 'README.md'), 'utf8').catch(() => undefined);
    if (readme !== undefined) items.push({ path: 'README.md', text: readme.replace(/^Example files \(Pocket Flight\):.*$/m, 'Your game starts in `src/main.ts`. The Pocket Flight example was removed.') });
    await replaceItems(target, items);
    const removed = [];
    try {
      for (const file of status.present) { await rm(path.join(target, 'src', file), { force: true }); removed.push(`src/${file}`); }
    } catch (error) {
      throw new Error(`The starter is in place, but some example files could not be deleted: ${error.message}. Close anything using the game and remove the rest by hand.`);
    }
    return { removed, starter: starterFile };
  });
}

/** Double-click launchers for the Game Workshop dashboard. serverPath is relative to the project folder. */
export async function writeLaunchers(directory, serverPath) {
  const posix = serverPath.replaceAll('\\', '/');
  const windows = serverPath.replaceAll('/', '\\');
  const nodeCheck = (open, downloadPage) => [
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Game Workshop needs Node.js 22 or newer. Opening the download page..."',
    `  ${open} "https://nodejs.org/"`,
    '  echo "Install Node.js, then double-click this file again."',
    '  read -r -p "Press Enter to close..." _',
    '  exit 1',
    'fi'
  ];
  const files = {
    'Game Workshop.command': ['#!/bin/sh', 'cd "$(dirname "$0")" || exit 1', ...nodeCheck('open'), `node "${posix}" --open`, ''].join('\n'),
    'Game Workshop.sh': ['#!/bin/sh', 'cd "$(dirname "$0")" || exit 1', ...nodeCheck('xdg-open'), `node "${posix}" --open`, ''].join('\n'),
    'Game Workshop.bat': ['@echo off', 'cd /d "%~dp0"', 'where node >nul 2>nul', 'if errorlevel 1 (', '  echo Game Workshop needs Node.js 22 or newer. Opening the download page...', '  start https://nodejs.org/', '  echo Install Node.js, then double-click this file again.', '  pause', '  exit /b 1', ')', `node "${windows}" --open`, 'if errorlevel 1 pause', ''].join('\r\n')
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(directory, name);
    await writeFile(file, text);
    if (!name.endsWith('.bat')) await chmod(file, 0o755);
  }
}

const exists = file => access(file).then(() => true, () => false);

/** Writes a file and flushes it to disk, so the file survives a power cut once this returns. */
async function writeDurable(file, text) {
  const handle = await open(file, 'w');
  try { await handle.writeFile(text); await handle.sync(); }
  finally { await handle.close(); }
}

/** Whether a process is still running. */
function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

const busy = () => new Error('This game is being updated. Try again when it finishes.');

/**
 * Runs a task while holding the game's lock, so only one updater works on a game at a time, across processes.
 * A lock whose process has stopped is taken over.
 */
async function withGameLock(target, task) {
  const file = path.join(target, tools, '.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt++) {
    try {
      const handle = await open(file, 'wx');
      try { await handle.writeFile(String(process.pid)); }
      finally { await handle.close(); }
      acquired = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const text = await readFile(file, 'utf8').catch(() => undefined);
      if (text === undefined) continue; // released just now: try again
      const owner = Number(text);
      if (Number.isInteger(owner) && owner > 0 && processAlive(owner)) throw busy();
      // An empty lock is still being written. Only a lock older than a minute is treated as abandoned.
      if (!owner && Date.now() - (await stat(file).catch(() => ({ mtimeMs: 0 }))).mtimeMs < 60000) throw busy();
      await rm(file, { force: true });
    }
  }
  if (!acquired) throw busy();
  try { return await task(); }
  finally { await rm(file, { force: true }); }
}

/** Runs a task on a game while holding its lock, after finishing any interrupted update. */
async function lockedGame(directory, task) {
  const target = path.resolve(directory);
  if (!(await exists(path.join(target, tools)))) throw new Error('That folder is not a Game Workshop game.');
  return withGameLock(target, async () => { await recoverInterruptedUpdate(target); return task(target); });
}

/**
 * Puts back each listed item: a new copy that was placed goes back to staging, and an old copy that was set aside is restored.
 * Safe to run again after an interruption, because each step leaves the same state a repeat would expect.
 */
async function restoreItems(target, work, paths) {
  for (const item of paths) {
    const dest = path.join(target, item);
    const staged = path.join(work, 'new', item);
    const old = path.join(work, 'old', item);
    if (!(await exists(staged)) && (await exists(dest))) {
      await mkdir(path.dirname(staged), { recursive: true });
      await rename(dest, staged);
    }
    if (await exists(old)) {
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(old, dest);
    }
  }
}

/**
 * Removes the update's folders. The manifest goes first. The outcome markers (committed or rolled back) go last,
 * so an interrupted cleanup is finished rather than undone: a marker means the files are already in their final state.
 */
async function finishCleanup(work) {
  for (const name of ['old', 'new', 'manifest.json']) await rm(path.join(work, name), { recursive: true, force: true });
  for (const marker of ['commit', 'rolled-back']) await rm(path.join(work, marker), { force: true });
  await rm(work, { recursive: true, force: true });
}

/** Finishes or undoes an update that was interrupted. Runs only while the game is locked. */
async function recoverInterruptedUpdate(target) {
  const work = path.join(target, tools, '.update');
  if (!(await exists(work))) return;
  if ((await exists(path.join(work, 'commit'))) || (await exists(path.join(work, 'rolled-back')))) return finishCleanup(work);
  const manifest = await readFile(path.join(work, 'manifest.json'), 'utf8').then(JSON.parse, () => undefined);
  if (manifest) {
    await restoreItems(target, work, manifest);
    await writeDurable(path.join(work, 'rolled-back'), 'rolled-back');
  }
  await finishCleanup(work);
}

/**
 * Replaces files in a game, all or nothing. Paths are relative to the game folder. The caller holds the game's lock.
 * Each new copy is built in a staging folder first. Then each old item is moved aside and its replacement moved in.
 * The commit marker is written once every item is in place. If anything fails before that, everything is put back.
 * Each item is { path, from } to copy a file or folder, or { path, text } to write a file.
 */
async function replaceItems(target, items, { onSwap } = {}) {
  const work = path.join(target, tools, '.update');
  const paths = items.map(item => item.path);
  await mkdir(path.join(work, 'new'), { recursive: true });
  try {
    for (const item of items) {
      const dest = path.join(work, 'new', item.path);
      await mkdir(path.dirname(dest), { recursive: true });
      if (item.text !== undefined) await writeFile(dest, item.text);
      else await cp(item.from, dest, { recursive: true });
    }
    await writeDurable(path.join(work, 'manifest.json'), JSON.stringify(paths));
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    throw error;
  }
  try {
    for (const item of items) {
      await onSwap?.(item.path);
      const dest = path.join(target, item.path);
      if (await exists(dest)) {
        await mkdir(path.dirname(path.join(work, 'old', item.path)), { recursive: true });
        await rename(dest, path.join(work, 'old', item.path));
      }
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(path.join(work, 'new', item.path), dest);
    }
    await writeDurable(path.join(work, 'commit'), 'committed');
  } catch (error) {
    try {
      await restoreItems(target, work, paths);
      await writeDurable(path.join(work, 'rolled-back'), 'rolled-back');
    } catch (restoreError) { throw new Error(`The update failed and could not be undone. Your previous files are in ${path.join(work, 'old')}. ${restoreError.message}`); }
    await finishCleanup(work);
    throw error;
  }
  await finishCleanup(work);
}

/**
 * Copies the chosen components (default: all) from this framework into a game.
 * Game code, src-tauri, profiles and Builds are not touched. Returns what changed and anything the game must wire up by hand.
 * Renderer config edits are part of the same all-or-nothing replacement, so a failure undoes them too.
 */
export async function updateGame(directory, only, { onSwap } = {}) {
  return lockedGame(directory, async target => {
    const before = await statusOf(target);
    const unknown = (only ?? []).filter(id => !COMPONENTS.some(component => component.id === id));
    if (unknown.length) throw new Error(`Unknown part: ${unknown[0]}`);
    const chosen = COMPONENTS.filter(component => !only || only.includes(component.id));
    if (!chosen.length) throw new Error('Choose at least one part to update.');
    const versionFile = path.join(target, tools, 'VERSION.json');
    const meta = JSON.parse(await readFile(versionFile, 'utf8'));
    const framework = await frameworkVersion();
    const components = { ...meta.components };
    for (const component of chosen) components[component.id] = framework.hashes[component.id];
    const everything = chosen.length === COMPONENTS.length;
    const text = JSON.stringify({ framework: meta.framework, renderer: meta.renderer, version: everything ? framework.version : meta.version, copiedAt: new Date().toISOString(), components, example: meta.example }, null, 2) + '\n';
    const copies = chosen.flatMap(component => component.files.map(item => ({ path: `${tools}/${item}`, from: path.join(source, item) })));
    // New renderers arrive with the renderers part. Their aliases are planned first, then applied with the copy.
    const wiring = chosen.some(component => component.id === 'renderers') ? await planRendererWiring(target) : { notes: [], edits: [] };
    await replaceItems(target, [...copies, { path: `${tools}/VERSION.json`, text }, ...wiring.edits], { onSwap });
    return { from: before.version, to: everything ? framework.version : before.version, updated: chosen.map(component => component.id), notes: wiring.notes };
  });
}

/** Older names for the first two renderers, so existing scripts and links keep working. */
const legacyRenderers = { '2d': 'pixi', '3d': 'three' };

/**
 * The renderer id a game was made with. Games made before this was recorded are inferred from their packages.
 */
export async function gameRenderer(gameRoot) {
  const meta = JSON.parse(await readFile(path.join(gameRoot, tools, 'VERSION.json'), 'utf8').catch(() => '{}'));
  if (meta.renderer) return meta.renderer;
  const pkg = JSON.parse(await readFile(path.join(gameRoot, 'package.json'), 'utf8').catch(() => '{}'));
  const have = { ...pkg.dependencies, ...pkg.devDependencies };
  return have['three'] ? 'three' : have['pixi.js'] ? 'pixi' : 'canvas';
}

/** Creates a game with any renderer in the framework's registry. `renderer` is a registry id (or 2d / 3d). */
export async function createGame(directory, rendererArg) {
  const registry = await readRegistry(source);
  const renderer = Object.hasOwn(legacyRenderers, rendererArg) ? legacyRenderers[rendererArg] : rendererArg;
  const entry = registry.find(item => item.id === renderer);
  if (!directory || !entry) throw new Error(`Usage: npm run create:game -- <new-directory> <${registry.map(item => item.id).join('|')}>`);
  const target = path.resolve(directory);
  try { await access(target); throw new Error(`Destination already exists: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const name = path.basename(target).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'my-game';
  const own = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));

  // Copy the framework into the game so it never depends on this checkout after generation.
  await mkdir(path.join(target, 'src'), { recursive: true });
  for (const item of frameworkFiles) await cp(path.join(source, item), path.join(target, tools, item), { recursive: true });
  await writeFile(path.join(target, tools, 'VERSION.json'), JSON.stringify({ framework: own.name, version: own.version, renderer: entry.id, copiedAt: new Date().toISOString(), components: (await frameworkVersion()).hashes, example: { files: await exampleHashesFor(entry) } }, null, 2) + '\n');

  const scripts = {};
  for (const [key, value] of Object.entries(own.scripts)) if (key.includes(':') && !['create:game', 'export:ui'].includes(key)) scripts[key] = value;
  Object.assign(scripts, {
    dev: 'vite',
    build: 'tsc --noEmit && vite build',
    tauri: 'tauri',
    doctor: `node ${tools}/scripts/doctor.mjs`,
    'export:ui': `node ${tools}/scripts/export-ui/server.mjs`,
    workshop: `node ${tools}/scripts/export-ui/server.mjs --open`
  });
  const dependencies = Object.fromEntries(['@tauri-apps/api', ...entry.packages].map(key => [key, own.devDependencies[key]]));
  const devDependencies = Object.fromEntries(['vite', 'typescript', '@types/node', '@tauri-apps/cli', ...(entry.devPackages ?? [])].map(key => [key, own.devDependencies[key]]));
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2) + '\n');

  // Game code imports the framework by package-style names, which the aliases below resolve to the copied files.
  for (const file of [...demoFiles, entry.demo]) await writeFile(path.join(target, 'src', file), rewriteExample(await readFile(path.join(source, 'src', file), 'utf8')));

  await writeFile(path.join(target, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/${entry.demo}"></script></body></html>`);
  const aliasPaths = { gameframework: `src/framework/index.ts`, ...Object.fromEntries(registry.map(item => [`gameframework/${item.id}`, `src/renderers/${item.entry}`])), 'gameframework/desktop': 'src/platform/desktop.ts' };
  await writeFile(path.join(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true, types: ['vite/client', 'node'], lib: ['ES2022', 'DOM'], paths: Object.fromEntries(Object.entries(aliasPaths).map(([alias, file]) => [alias, [`./${tools}/${file}`]])) }, include: ['src'] }, null, 2) + '\n');
  const viteConfig = [
    "import { fileURLToPath } from 'node:url';",
    "import { defineConfig } from 'vite';",
    `const framework = (file: string) => fileURLToPath(new URL('./${tools}/' + file, import.meta.url));`,
    'export default defineConfig({',
    "  base: './',",
    "  resolve: {",
    "    dedupe: ['pixi.js', 'three'],",
    '    alias: [',
    ...Object.entries(aliasPaths).map(([alias, file]) => `      { find: ${alias === 'gameframework' ? '/^gameframework$/' : `'${alias}'`}, replacement: framework('${file}') },`),
    '    ]',
    '  },',
    "  server: { host: process.env.TAURI_DEV_HOST || '127.0.0.1', port: 5173, strictPort: true }",
    '});',
    ''
  ].join('\n');
  await writeFile(path.join(target, 'vite.config.ts'), viteConfig);
  await writeFile(path.join(target, '.gitignore'), ['node_modules/', 'dist/', 'Builds/', 'src-tauri/target/', 'src-tauri/gen/schemas/', 'src-tauri/gen/android/.gradle/', 'src-tauri/gen/android/**/build/', 'src-tauri/gen/android/local.properties', 'src-tauri/gen/android/keystore.properties', 'src-tauri/gen/apple/build/', 'src-tauri/gen/apple/Pods/', 'src-tauri/gen/apple/**/xcuserdata/', 'vendor/*', '!vendor/README.md', ''].join('\n'));

  await cp(path.join(source, 'src-tauri'), path.join(target, 'src-tauri'), { recursive: true, filter: entry => !['target', 'gen'].includes(path.basename(entry)) });
  const configPath = path.join(target, 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.productName = name; config.identifier = `com.game.${name.replace(/[^a-z0-9]/g, '') || 'game'}`; config.app.windows[0].title = name;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await mkdir(path.join(target, 'vendor'), { recursive: true });
  await cp(path.join(source, 'vendor', 'README.md'), path.join(target, 'vendor', 'README.md'));
  await writeLaunchers(target, `${tools}/scripts/export-ui/server.mjs`);
  await writeFile(path.join(target, 'README.md'), `# ${name}

This game is self-contained. The framework is copied into \`${tools}/\`, so you can delete the framework checkout you created it from.

## Get started

1. Install [Node.js 22 or newer](https://nodejs.org/) if you don't have it.
2. Double-click \`Game Workshop.command\` (Mac), \`Game Workshop.bat\` (Windows) or \`Game Workshop.sh\` (Linux). If your computer blocks it, right-click it and choose Open (Mac), or choose More info and then Run anyway (Windows).
3. In Game Workshop, click **Play in browser** (top right of the overview). Install dependencies first if the Web row asks you to.

## Build for platforms

Each platform has a row in Game Workshop's overview and its own page. The main button does the next step: build, set up a native project, or open it in Xcode or Android Studio. See [Game Workshop](${tools}/docs/EXPORT-DASHBOARD.md) and [desktop and mobile builds](${tools}/docs/PLATFORM-BUILDS.md).

## Your code

Example files (Pocket Flight): \`src/flappy.ts\` (rules), \`src/demo.ts\` (flow), \`src/demo-settings.ts\` (settings), \`src/${entry.demo}\` (renderer and entry), \`src/demo.css\` (styling). Replace them with your own game and update \`index.html\`.

Native projects in \`src-tauri/gen/\` belong to you. Keep them in Git.
`);
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const target = await createGame(...process.argv.slice(2)); console.log(`Created ${target}\nNext: cd "${target}", then npm install and npm run dev`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
