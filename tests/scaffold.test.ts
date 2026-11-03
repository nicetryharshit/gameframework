import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Generator is a plain Node module.
import { createGame } from '../scripts/create-game.mjs';

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = 'tools/gameframework';

test('generated games carry their own framework tools and no link back to this checkout', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-scaffold-'));
  try {
    for (const renderer of ['2d', '3d']) {
      const target = path.join(temp, renderer);
      await createGame(target, renderer);
      const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
      assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@tauri-apps/api', renderer === '2d' ? 'pixi.js' : 'three'].sort());
      assert.equal(JSON.stringify(pkg).includes('file:'), false);
      assert.equal(pkg.scripts['export:ui'], `node ${tools}/scripts/export-ui/server.mjs`);
      assert.equal(pkg.scripts.doctor, `node ${tools}/scripts/doctor.mjs`);
      assert.equal(pkg.scripts.workshop, `node ${tools}/scripts/export-ui/server.mjs --open`);
      assert.ok(pkg.scripts['build:desktop'] && pkg.scripts['build:web'] && pkg.scripts['open:ios'] && pkg.scripts['open:android']);
      for (const file of ['src/framework/index.ts', 'src/renderers/pixi.ts', 'src/platform/desktop.ts', 'scripts/export-ui/server.mjs', 'scripts/doctor.mjs', 'docs/FRAMEWORK.md', 'VERSION.json']) {
        await access(path.join(target, tools, file));
      }
      assert.match(await readFile(path.join(target, 'vite.config.ts'), 'utf8'), /gameframework\/desktop/);
      const tsconfig = JSON.parse(await readFile(path.join(target, 'tsconfig.json'), 'utf8'));
      assert.equal(tsconfig.compilerOptions.paths['gameframework/pixi'][0], `./${tools}/src/renderers/pixi.ts`);
      assert.match(await readFile(path.join(target, 'src', `demo-${renderer}.ts`), 'utf8'), /gameframework\/(pixi|three)/);
      assert.match(await readFile(path.join(target, 'src', 'flappy.ts'), 'utf8'), /class FlappyGame/);
      assert.match(await readFile(path.join(target, 'src', 'demo.ts'), 'utf8'), /states.register\('over'/);
      assert.match(await readFile(path.join(target, 'README.md'), 'utf8'), /delete the framework checkout/);
      const native = JSON.parse(await readFile(path.join(target, 'src-tauri', 'tauri.conf.json'), 'utf8'));
      assert.equal(native.app.windows[0].fullscreen, true); assert.equal(native.app.windows[0].decorations, false);
      await access(path.join(target, 'vendor', 'README.md'));
      for (const launcher of ['Game Workshop.command', 'Game Workshop.bat', 'Game Workshop.sh']) await access(path.join(target, launcher));
      await assert.rejects(createGame(target, renderer), /already exists/);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('generated games type-check and build using only their copied tools', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-build-'));
  try {
    for (const renderer of ['2d', '3d']) {
      const target = path.join(temp, renderer);
      await createGame(target, renderer);
      // Reuse this checkout's installed packages so the test does not download dependencies again.
      await symlink(path.join(checkout, 'node_modules'), path.join(target, 'node_modules'), 'junction');
      execFileSync(process.execPath, [path.join(target, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], { cwd: target, stdio: 'pipe' });
      execFileSync(process.execPath, [path.join(target, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: target, stdio: 'pipe' });
      await access(path.join(target, 'dist', 'index.html'));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
