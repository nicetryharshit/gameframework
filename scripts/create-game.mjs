#!/usr/bin/env node
import { access, chmod, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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
  { id: 'workshop', label: 'Workshop dashboard', note: 'This dashboard and the doctor check', files: ['scripts/export-ui', 'scripts/doctor.mjs'] },
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
async function readRegistry(root) {
  const text = await readFile(path.join(root, 'src/renderers/registry.json'), 'utf8').catch(() => '{"renderers":[]}');
  return JSON.parse(text).renderers;
}
const aliasOf = entry => `gameframework/${entry.id}`;

/**
 * Maps every renderer in the game's copy of the registry in tsconfig.json and vite.config.ts.
 * An alias costs nothing until a file imports it. Returns notes for anything it could not edit.
 */
async function wireRenderers(target) {
  const notes = [];
  const registry = await readRegistry(path.join(target, tools));
  const tsFile = path.join(target, 'tsconfig.json');
  const tsconfig = JSON.parse(await readFile(tsFile, 'utf8').catch(() => 'null') ?? 'null');
  if (!tsconfig?.compilerOptions) notes.push('tsconfig.json was not found or has no compilerOptions. Add the renderer paths by hand.');
  else {
    const paths = tsconfig.compilerOptions.paths ??= {};
    let changed = false;
    for (const entry of registry) if (!paths[aliasOf(entry)]) { paths[aliasOf(entry)] = [`./${tools}/src/renderers/${entry.entry}`]; changed = true; }
    if (changed) await writeFile(tsFile, JSON.stringify(tsconfig, null, 2) + '\n');
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
      await writeFile(viteFile, vite);
    }
  }
  return notes;
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
 * and adds its packages to package.json. It does not run npm; the dashboard's Install dependencies does.
 */
export async function addRenderer(directory, id) {
  const target = path.resolve(directory);
  await inspectGame(target);
  const entry = (await readRegistry(source)).find(item => item.id === id);
  if (!entry) throw new Error(`Unknown renderer: ${id}`);
  const renderers = COMPONENTS.find(component => component.id === 'renderers');
  const copied = await readRegistry(path.join(target, tools));
  if (!copied.some(item => item.id === id) || !(await access(path.join(target, tools, 'src/renderers', entry.entry)).then(() => true, () => false))) {
    const versionFile = path.join(target, tools, 'VERSION.json');
    const meta = JSON.parse(await readFile(versionFile, 'utf8'));
    meta.components = { ...meta.components, renderers: (await frameworkVersion()).hashes.renderers };
    const copies = renderers.files.map(item => ({ path: item, from: path.join(source, item) }));
    await replaceItems(target, [...copies, { path: 'VERSION.json', text: JSON.stringify(meta, null, 2) + '\n' }]);
  }
  const notes = await wireRenderers(target);
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
    await writeFile(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    notes.push(`Added ${added.join(', ')} to package.json. Run Install dependencies in the game before using it.`);
  }
  notes.push(`Import it with: import { create${entry.id[0].toUpperCase()}${entry.id.slice(1)}Renderer } from '${aliasOf(entry)}'`);
  return { renderer: id, added, notes };
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
  const target = path.resolve(directory);
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

/**
 * Puts back each listed item: a new copy that was placed is removed, and an old copy that was moved aside is restored.
 * An item that was never reached still has its staged copy and is left as it was.
 */
async function restoreItems(root, work, paths) {
  for (const item of paths) {
    const dest = path.join(root, item);
    if (!(await exists(path.join(work, 'new', item)))) await rm(dest, { recursive: true, force: true });
    if (await exists(path.join(work, 'old', item))) {
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(path.join(work, 'old', item), dest);
    }
  }
}

/** Finishes the cleanup of an update that was interrupted (for example, the app was closed mid-update). */
async function recoverInterruptedUpdate(root) {
  const work = path.join(root, '.update');
  if (!(await exists(work))) return;
  const manifest = await readFile(path.join(work, 'manifest.json'), 'utf8').then(JSON.parse, () => undefined);
  if (manifest) await restoreItems(root, work, manifest);
  await rm(work, { recursive: true, force: true });
}

/**
 * Replaces framework files in a game, all or nothing. Each new copy is built in a staging folder first.
 * Then each old item is moved aside and its replacement moved in. If any step fails, every item is put back as it was.
 * Old copies are deleted only after everything is in place.
 * Each item is { path, from } to copy a file or folder, or { path, text } to write a file.
 */
async function replaceItems(target, items, { onSwap } = {}) {
  const root = path.join(target, tools);
  const work = path.join(root, '.update');
  await recoverInterruptedUpdate(root);
  await mkdir(path.join(work, 'new'), { recursive: true });
  try {
    for (const item of items) {
      const dest = path.join(work, 'new', item.path);
      await mkdir(path.dirname(dest), { recursive: true });
      if (item.text !== undefined) await writeFile(dest, item.text);
      else await cp(item.from, dest, { recursive: true });
    }
    await writeFile(path.join(work, 'manifest.json'), JSON.stringify(items.map(item => item.path)));
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    throw error;
  }
  const paths = items.map(item => item.path);
  try {
    for (const item of items) {
      await onSwap?.(item.path);
      const dest = path.join(root, item.path);
      if (await exists(dest)) {
        await mkdir(path.dirname(path.join(work, 'old', item.path)), { recursive: true });
        await rename(dest, path.join(work, 'old', item.path));
      }
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(path.join(work, 'new', item.path), dest);
    }
  } catch (error) {
    try { await restoreItems(root, work, paths); }
    catch (restoreError) { throw new Error(`The update failed and could not be undone. Your previous files are in ${path.join(work, 'old')}. ${restoreError.message}`); }
    await rm(work, { recursive: true, force: true });
    throw error;
  }
  await rm(work, { recursive: true, force: true });
}

/**
 * Copies the chosen components (default: all) from this framework into a game.
 * Game code, src-tauri, profiles and Builds are not touched. Returns what changed and anything the game must wire up by hand.
 */
export async function updateGame(directory, only, { onSwap } = {}) {
  const target = path.resolve(directory);
  const before = await inspectGame(target);
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
  const text = JSON.stringify({ framework: meta.framework, version: everything ? framework.version : meta.version, copiedAt: new Date().toISOString(), components }, null, 2) + '\n';
  const copies = chosen.flatMap(component => component.files.map(item => ({ path: item, from: path.join(source, item) })));
  await replaceItems(target, [...copies, { path: 'VERSION.json', text }], { onSwap });

  // New renderers arrive with the renderers part. Map their aliases so they are ready to import.
  const notes = chosen.some(component => component.id === 'renderers') ? await wireRenderers(target) : [];
  return { from: before.version, to: everything ? framework.version : before.version, updated: chosen.map(component => component.id), notes };
}

export async function createGame(directory, renderer) {
  if (!directory || !['2d', '3d'].includes(renderer)) throw new Error('Usage: npm run create:game -- <new-directory> <2d|3d>');
  const target = path.resolve(directory);
  try { await access(target); throw new Error(`Destination already exists: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const name = path.basename(target).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'my-game';
  const own = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const rendererPackage = renderer === '2d' ? 'pixi.js' : 'three';

  // Copy the framework into the game so it never depends on this checkout after generation.
  await mkdir(path.join(target, 'src'), { recursive: true });
  for (const item of frameworkFiles) await cp(path.join(source, item), path.join(target, tools, item), { recursive: true });
  await writeFile(path.join(target, tools, 'VERSION.json'), JSON.stringify({ framework: own.name, version: own.version, copiedAt: new Date().toISOString(), components: (await frameworkVersion()).hashes }, null, 2) + '\n');

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
  const dependencies = { [rendererPackage]: own.devDependencies[rendererPackage], '@tauri-apps/api': own.devDependencies['@tauri-apps/api'] };
  const devDependencies = Object.fromEntries(['vite', 'typescript', '@types/node', '@tauri-apps/cli', ...(renderer === '3d' ? ['@types/three'] : [])].map(key => [key, own.devDependencies[key]]));
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2) + '\n');

  // Game code imports the framework by package-style names, which the aliases below resolve to the copied files.
  const rewrite = text => text.replaceAll("from './framework'", "from 'gameframework'").replaceAll("from './renderers/pixi'", "from 'gameframework/pixi'").replaceAll("from './renderers/three'", "from 'gameframework/three'").replaceAll("from './platform/desktop'", "from 'gameframework/desktop'");
  for (const file of [...demoFiles, `demo-${renderer}.ts`]) await writeFile(path.join(target, 'src', file), rewrite(await readFile(path.join(source, 'src', file), 'utf8')));

  await writeFile(path.join(target, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/demo-${renderer}.ts"></script></body></html>`);
  const aliasPaths = { gameframework: `src/framework/index.ts`, ...Object.fromEntries((await readRegistry(source)).map(entry => [`gameframework/${entry.id}`, `src/renderers/${entry.entry}`])), 'gameframework/desktop': 'src/platform/desktop.ts' };
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

Example files (Pocket Flight): \`src/flappy.ts\` (rules), \`src/demo.ts\` (flow), \`src/demo-settings.ts\` (settings), \`src/demo-${renderer}.ts\` (renderer and entry), \`src/demo.css\` (styling). Replace them with your own game and update \`index.html\`.

Native projects in \`src-tauri/gen/\` belong to you. Keep them in Git.
`);
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const target = await createGame(...process.argv.slice(2)); console.log(`Created ${target}\nNext: cd "${target}", then npm install and npm run dev`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
