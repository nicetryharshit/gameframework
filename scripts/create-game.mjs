#!/usr/bin/env node
import { access, chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = 'tools/gameframework';
// Framework files a game needs to run, build and open the Build dashboard without this checkout.
const frameworkFiles = ['src/framework', 'src/renderers', 'src/platform', 'scripts/export-ui', 'scripts/doctor.mjs', 'docs'];
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
  await writeFile(path.join(target, tools, 'VERSION.json'), JSON.stringify({ framework: own.name, version: own.version, copiedAt: new Date().toISOString() }, null, 2) + '\n');

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
  const aliasPaths = { gameframework: `src/framework/index.ts`, 'gameframework/pixi': 'src/renderers/pixi.ts', 'gameframework/three': 'src/renderers/three.ts', 'gameframework/desktop': 'src/platform/desktop.ts' };
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
  config.productName = name; config.identifier = `com.example.${name.replaceAll('-', '')}`; config.app.windows[0].title = name;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await mkdir(path.join(target, 'vendor'), { recursive: true });
  await cp(path.join(source, 'vendor', 'README.md'), path.join(target, 'vendor', 'README.md'));
  await writeLaunchers(target, `${tools}/scripts/export-ui/server.mjs`);
  await writeFile(path.join(target, 'README.md'), `# ${name}

This game is self-contained. The framework is copied into \`${tools}/\`, so you can delete the framework checkout you created it from.

## Get started

1. Install [Node.js 22 or newer](https://nodejs.org/) if you don't have it.
2. Double-click \`Game Workshop.command\` (Mac), \`Game Workshop.bat\` (Windows) or \`Game Workshop.sh\` (Linux). If your computer blocks it, right-click it and choose Open (Mac), or choose More info and then Run anyway (Windows).
3. In Game Workshop, click **Play in browser** on the Web card. Install dependencies first if the card asks you to.

## Build for platforms

Each platform has a card in Game Workshop. Its main button does the next step: build, set up a native project, or open it in Xcode or Android Studio. See [Game Workshop](${tools}/docs/EXPORT-DASHBOARD.md) and [desktop and mobile builds](${tools}/docs/PLATFORM-BUILDS.md).

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
