import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Generator is a plain Node module.
import { createGame, updateGame, inspectGame, addRenderer } from '../scripts/create-game.mjs';

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

test('updating a game refreshes its tools and leaves its own files alone', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-update-'));
  try {
    const target = path.join(temp, 'game');
    await createGame(target, '2d');
    const ui = path.join(target, tools, 'scripts/export-ui/app.js');
    const original = await readFile(ui, 'utf8');
    await writeFile(ui, '// stale copy');
    await writeFile(path.join(target, 'src', 'flappy.ts'), '// my game code');
    await writeFile(path.join(target, 'export-profiles.json'), '{"mine":true}');
    const status = async () => Object.fromEntries((await inspectGame(target)).components.map((item: { id: string; status: string }) => [item.id, item.status]));
    assert.deepEqual(await status(), { framework: 'current', renderers: 'current', platform: 'current', workshop: 'modified', docs: 'current' });
    const stale = await inspectGame(target);
    assert.equal(stale.outdated, true);
    // A partial update only touches the chosen part.
    await writeFile(path.join(target, tools, 'src/framework/index.ts'), '// stale core');
    const partial = await updateGame(target, ['workshop']);
    assert.deepEqual(partial.updated, ['workshop']);
    assert.equal(await readFile(path.join(target, tools, 'src/framework/index.ts'), 'utf8'), '// stale core');
    assert.equal((await status()).workshop, 'current');
    assert.equal((await status()).framework, 'modified');
    await assert.rejects(updateGame(target, []), /at least one/);
    await assert.rejects(updateGame(target, ['nope']), /Unknown part/);
    const full = await updateGame(target);
    assert.equal((await inspectGame(target)).outdated, false);
    assert.ok(full.updated.length === 5);
    await writeFile(path.join(target, tools, 'src/renderers/extra.ts'), '// new renderer');
    const withNote = await updateGame(target, ['renderers']);
    assert.deepEqual(withNote.notes, []);
    assert.equal(await readFile(path.join(target, tools, 'src/renderers/extra.ts'), 'utf8').catch(() => 'gone'), 'gone');
    assert.equal(await readFile(ui, 'utf8'), original);
    assert.equal(await readFile(path.join(target, 'src', 'flappy.ts'), 'utf8'), '// my game code');
    assert.equal(await readFile(path.join(target, 'export-profiles.json'), 'utf8'), '{"mine":true}');
    await assert.rejects(updateGame(temp), /not a Game Workshop game/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

/** Every file under a folder with its text, so two states can be compared exactly. */
async function snapshot(dir: string) {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath ?? entry.path, entry.name);
    out[path.relative(dir, file)] = await readFile(file, 'utf8');
  }
  return out;
}

test('a failed update puts every part back exactly as it was', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-failed-update-'));
  try {
    const target = path.join(temp, 'game');
    await createGame(target, '2d');
    // Make the game's tools differ from the framework so a rollback is visible.
    await writeFile(path.join(target, tools, 'src/framework/index.ts'), '// stale core');
    await writeFile(path.join(target, tools, 'docs/FRAMEWORK.md'), '// stale docs');
    const before = await snapshot(path.join(target, tools));
    // Fail on the last part, after the earlier parts have already been swapped in.
    await assert.rejects(
      updateGame(target, undefined, { onSwap: (item: string) => { if (item === 'docs') throw new Error('disk full'); } }),
      /disk full/
    );
    assert.deepEqual(await snapshot(path.join(target, tools)), before);
    await assert.rejects(access(path.join(target, tools, '.update')));
    // The game still updates normally afterwards.
    await updateGame(target);
    assert.equal((await inspectGame(target)).outdated, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('an update interrupted partway is undone on the next run', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-interrupted-'));
  try {
    const target = path.join(temp, 'game');
    await createGame(target, '2d');
    const root = path.join(target, tools);
    await writeFile(path.join(root, 'src/framework/index.ts'), '// stale core');
    await writeFile(path.join(root, 'docs/FRAMEWORK.md'), '// stale docs');
    const before = await snapshot(root);
    // Simulate the app closing after the core was swapped in but before the docs were.
    const work = path.join(root, '.update');
    await mkdir(path.join(work, 'new/src'), { recursive: true });
    await mkdir(path.join(work, 'new/docs'), { recursive: true });
    await mkdir(path.join(work, 'old/src'), { recursive: true });
    await writeFile(path.join(work, 'new/docs/FRAMEWORK.md'), '// new docs');
    await writeFile(path.join(work, 'manifest.json'), JSON.stringify(['src/framework', 'docs']));
    await rename(path.join(root, 'src/framework'), path.join(work, 'old/src/framework'));
    await mkdir(path.join(work, 'new/src/framework'), { recursive: true });
    await writeFile(path.join(work, 'new/src/framework/index.ts'), '// half-copied core');
    await rename(path.join(work, 'new/src/framework'), path.join(root, 'src/framework'));
    // The next run finishes the cleanup: the core goes back, the docs were never touched, and the old files are restored.
    await assert.rejects(updateGame(target, undefined, { onSwap: () => { throw new Error('stop here'); } }), /stop here/);
    assert.deepEqual(await snapshot(root), before);
    await assert.rejects(access(work));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('a failed renderer config edit restores the game config', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-config-'));
  try {
    const target = path.join(temp, 'game');
    await createGame(target, '2d');
    await writeFile(path.join(target, 'tsconfig.json'), '{ "compilerOptions": ');
    const config = await readFile(path.join(target, 'tsconfig.json'), 'utf8');
    const vite = await readFile(path.join(target, 'vite.config.ts'), 'utf8');
    await assert.rejects(updateGame(target, ['renderers']));
    assert.equal(await readFile(path.join(target, 'tsconfig.json'), 'utf8'), config);
    assert.equal(await readFile(path.join(target, 'vite.config.ts'), 'utf8'), vite);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('adding a renderer maps it, adds only its packages, and is safe to repeat', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-renderer-'));
  try {
    const target = path.join(temp, 'game');
    await createGame(target, '2d');
    const states = async () => Object.fromEntries((await inspectGame(target)).renderers.map((item: { id: string; status: string }) => [item.id, item.status]));
    // Canvas needs no packages and every new game maps it, so it is ready from the start.
    assert.deepEqual(await states(), { pixi: 'ready', three: 'available', canvas: 'ready' });

    // Adding a renderer that has no packages leaves package.json as it was.
    const before = await readFile(path.join(target, 'package.json'), 'utf8');
    const canvas = await addRenderer(target, 'canvas');
    assert.deepEqual(canvas.added, []);
    assert.equal(await readFile(path.join(target, 'package.json'), 'utf8'), before);
    // Three needs its packages at the framework's versions.
    const three = await addRenderer(target, 'three');
    assert.deepEqual(three.added.sort(), ['@types/three', 'three']);
    const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    const own = JSON.parse(await readFile(path.join(checkout, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies.three, own.devDependencies.three);
    assert.equal(pkg.devDependencies['@types/three'], own.devDependencies['@types/three']);
    assert.ok(pkg.dependencies['pixi.js'], 'existing renderer stays');
    assert.deepEqual(await states(), { pixi: 'ready', three: 'ready', canvas: 'ready' });

    const again = await addRenderer(target, 'three');
    assert.deepEqual(again.added, []);
    const vite = await readFile(path.join(target, 'vite.config.ts'), 'utf8');
    assert.equal(vite.split("'gameframework/canvas'").length, 2, 'alias added once');
    await assert.rejects(addRenderer(target, 'nope'), /Unknown renderer/);
    await assert.rejects(addRenderer(temp, 'canvas'), /not a Game Workshop game/);

    // A game made before the registry existed gets its renderers mapped by a renderers update.
    const old = path.join(temp, 'old');
    await createGame(old, '2d');
    await rm(path.join(old, tools, 'src/renderers/registry.json'));
    await rm(path.join(old, tools, 'src/renderers/canvas.ts'));
    const tsFile = path.join(old, 'tsconfig.json');
    const ts = JSON.parse(await readFile(tsFile, 'utf8')); delete ts.compilerOptions.paths['gameframework/canvas'];
    await writeFile(tsFile, JSON.stringify(ts));
    await writeFile(path.join(old, 'vite.config.ts'), (await readFile(path.join(old, 'vite.config.ts'), 'utf8')).replace(/.*gameframework\/canvas.*\n/, ''));
    const update = await updateGame(old, ['renderers']);
    assert.deepEqual(update.notes, []);
    assert.ok(JSON.parse(await readFile(tsFile, 'utf8')).compilerOptions.paths['gameframework/canvas']);
    assert.match(await readFile(path.join(old, 'vite.config.ts'), 'utf8'), /gameframework\/canvas/);
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
      // A game that imports the dependency-free renderer must resolve and bundle it too.
      await writeFile(path.join(target, 'src', 'canvas-check.ts'), "import { createCanvasRenderer } from 'gameframework/canvas';\nexport const make = (el: HTMLElement) => createCanvasRenderer(el, { background: '#000' });\n");
      execFileSync(process.execPath, [path.join(target, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], { cwd: target, stdio: 'pipe' });
      execFileSync(process.execPath, [path.join(target, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: target, stdio: 'pipe' });
      await access(path.join(target, 'dist', 'index.html'));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
