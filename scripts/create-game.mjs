#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function createGame(directory, renderer, framework) {
  if (!directory || !['2d', '3d'].includes(renderer)) throw new Error('Usage: create-web-game <new-directory> <2d|3d> [framework-package-spec]');
  const target = path.resolve(directory);
  try { await access(target); throw new Error(`Destination already exists: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const spec = framework ?? `file:${path.relative(target, source).replaceAll('\\', '/')}`;
  const name = path.basename(target).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'my-game';
  const own = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  await mkdir(path.join(target, 'src'), { recursive: true });
  const scripts = { dev: 'vite', build: 'tsc --noEmit && vite build' };
  for (const [key, value] of Object.entries(own.scripts)) if (key.includes(':') && key !== 'create:game') scripts[key] = value;
  scripts.tauri = 'tauri';
  scripts['export:ui'] = 'game-export-ui';
  const dependencies = { 'web-game-framework': spec, '@tauri-apps/api': own.devDependencies['@tauri-apps/api'], [renderer === '2d' ? 'pixi.js' : 'three']: own.devDependencies[renderer === '2d' ? 'pixi.js' : 'three'] };
  const devDependencies = {};
  for (const key of ['vite', 'typescript', '@types/node', '@tauri-apps/cli', ...(renderer === '3d' ? ['@types/three'] : [])]) devDependencies[key] = own.devDependencies[key];
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2));
  for (const file of ['flappy.ts', 'demo.ts', 'demo-settings.ts', 'demo.css', `demo-${renderer}.ts`]) {
    const content = (await readFile(path.join(source, 'src', file), 'utf8')).replaceAll("from './framework'", "from 'web-game-framework'").replaceAll("from './renderers/pixi'", "from 'web-game-framework/pixi'").replaceAll("from './renderers/three'", "from 'web-game-framework/three'").replaceAll("from './platform/desktop'", "from 'web-game-framework/desktop'");
    await writeFile(path.join(target, 'src', file), content);
  }
  await writeFile(path.join(target, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/demo-${renderer}.ts"></script></body></html>`);
  await writeFile(path.join(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true, types: ['vite/client', 'node'], lib: ['ES2022', 'DOM'] }, include: ['src'] }, null, 2));
  await writeFile(path.join(target, 'vite.config.ts'), "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './', resolve: { dedupe: ['pixi.js', 'three'] }, server: { host: process.env.TAURI_DEV_HOST || '127.0.0.1', port: 5173, strictPort: true } });\n");
  await writeFile(path.join(target, '.gitignore'), 'node_modules/\ndist/\nBuilds/\nsrc-tauri/target/\nsrc-tauri/gen/schemas/\nsrc-tauri/gen/android/.gradle/\nsrc-tauri/gen/android/**/build/\nsrc-tauri/gen/android/local.properties\nsrc-tauri/gen/android/keystore.properties\nsrc-tauri/gen/apple/build/\nsrc-tauri/gen/apple/Pods/\nsrc-tauri/gen/apple/**/xcuserdata/\n');
  await cp(path.join(source, 'src-tauri'), path.join(target, 'src-tauri'), { recursive: true, filter: name => !['target', 'gen'].includes(path.basename(name)) });
  const configPath = path.join(target, 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.productName = name; config.identifier = `com.example.${name.replaceAll('-', '')}`; config.app.windows[0].title = name;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await cp(path.join(source, 'docs/EXPORT-DASHBOARD.md'), path.join(target, 'EXPORT.md'));
  await writeFile(path.join(target, 'README.md'), `# ${name}\n\nRun npm install, then npm run dev. Pocket Flight is a removable example game: Space/Enter, tap the sky, or controller A to flap/select. Includes menus, scoring, pause, restart, best score and saved settings. Desktop starts fullscreen; use Settings for display/audio controls or F11 to toggle fullscreen.\n\n## Replace the example\n\nExample files: src/flappy.ts (rules), src/demo.ts (flow), src/demo-settings.ts (settings UI), src/demo-${renderer}.ts (renderer/entry), src/demo.css (styling). Replace these with your own game and update index.html. Keep package.json, vite.config.ts and src-tauri for builds.\n\n## Export\n\nRun npm run build:web or npm run build:desktop. Set app identity/icons in src-tauri before initializing mobile projects. On Mac run npm run init:ios, then npm run open:ios for Xcode. For Android run npm run init:android, then npm run open:android for Android Studio. Native projects live in src-tauri/gen/apple and src-tauri/gen/android. Keep customized native sources in Git; do not regenerate over customizations. Android builds currently produce debug APKs. iOS device/archive distribution still needs signing.\n\nFramework dependency: ${spec}\nReplace local dependencies with a pinned Git commit/tag for shared/CI builds. For detailed platform and upgrade guides see node_modules/web-game-framework/docs/.\n`);
  return target;
}
if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => '') === fileURLToPath(import.meta.url)) {
  try { const target = await createGame(...process.argv.slice(2)); console.log(`Created ${target}\nNext: cd "${target}" then npm install and npm run dev`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
