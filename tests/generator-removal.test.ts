import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error Generator is a plain Node module.
import { createGame, updateGame, inspectGame, addRenderer, addPhysics, removeExample, removeRenderer, removePhysics, exampleStatus, recordExample } from '../scripts/create-game.mjs';

const tools = 'tools/gameframework';
type Status = { id: string; status: string };

const exists = (file: string) => access(file).then(() => true, () => false);
const meta = (dir: string) => readFile(path.join(dir, tools, 'VERSION.json'), 'utf8').then(text => JSON.parse(text));
const json = (file: string) => readFile(file, 'utf8').then(text => JSON.parse(text));

async function withGames(task: (games: string) => Promise<void>) {
  const games = await mkdtemp(path.join(tmpdir(), 'webgame-generator-'));
  try { await task(games); } finally { await rm(games, { recursive: true, force: true }); }
}

test('the default example can be removed, and the game’s own copy of the generator removes it too', () => withGames(async games => {
  const a = path.join(games, 'alpha');
  await createGame(a, 'pixi');
  assert.deepEqual(Object.keys((await meta(a)).example.files).sort(), ['demo-2d.ts', 'demo-settings.ts', 'demo.css', 'demo.ts', 'flappy.ts']);
  let status = await exampleStatus(a);
  assert.equal(status.removable, true);
  assert.equal(status.present.length, 5);

  // Removal deletes the example files, writes a starter, and keeps the user's own files.
  await writeFile(path.join(a, 'src/keep.ts'), 'export const mine = 1;\n');
  const removed = await removeExample(a);
  assert.equal(removed.removed.length, 5);
  for (const file of ['flappy.ts', 'demo.ts', 'demo-settings.ts', 'demo.css', 'demo-2d.ts']) assert.equal(await exists(path.join(a, 'src', file)), false, file);
  assert.equal(await exists(path.join(a, 'src/main.ts')), true);
  assert.equal(await exists(path.join(a, 'src/keep.ts')), true, 'user file kept');
  assert.match(await readFile(path.join(a, 'index.html'), 'utf8'), /src\/main\.ts/);
  assert.equal((await meta(a)).example, undefined);
  assert.equal(await exists(path.join(a, 'src-tauri/tauri.conf.json')), true);
  status = await exampleStatus(a);
  assert.equal(status.removable, false);
  assert.equal(status.present.length, 0);
  assert.equal(await exists(path.join(a, tools, '.update')), false, 'no leftover update folder');
  await assert.rejects(removeExample(a), /no example to remove/);

  // An edited example file blocks removal, and nothing is deleted.
  const b = path.join(games, 'beta');
  await createGame(b, 'canvas');
  await writeFile(path.join(b, 'src/demo.ts'), (await readFile(path.join(b, 'src/demo.ts'), 'utf8')) + '// my edit\n');
  status = await exampleStatus(b);
  assert.deepEqual(status.changed, ['demo.ts']);
  assert.equal(status.removable, false);
  await assert.rejects(removeExample(b), /You edited demo\.ts/);
  assert.equal(await exists(path.join(b, 'src/flappy.ts')), true);

  // A legacy game with no recorded hashes is still recognised and removable.
  const c = path.join(games, 'gamma');
  await createGame(c, 'pixi');
  const legacy = await meta(c);
  delete legacy.example;
  await writeFile(path.join(c, tools, 'VERSION.json'), JSON.stringify(legacy, null, 2));
  assert.equal((await exampleStatus(c)).removable, true);
  await removeExample(c);

  // Updating tools keeps the example record while the example exists.
  const d = path.join(games, 'delta');
  await createGame(d, 'pixi');
  await updateGame(d, ['framework']);
  assert.ok((await meta(d)).example?.files, 'example record survives update');

  // An older game records its example, and the game's own copy of the generator removes it.
  const e = path.join(games, 'epsilon');
  await createGame(e, 'pixi');
  const older = await meta(e);
  delete older.example;
  await writeFile(path.join(e, tools, 'VERSION.json'), JSON.stringify(older, null, 2));
  assert.equal(await recordExample(e), true);
  assert.ok((await meta(e)).example.files['flappy.ts']);
  assert.equal(await recordExample(e), false, 'second record is a no-op');
  const own = await import(pathToFileURL(path.join(e, tools, 'scripts/create-game.mjs')).href);
  assert.equal((await own.exampleStatus(e)).removable, true);
  await own.removeExample(e);
  assert.equal(await exists(path.join(e, 'src/flappy.ts')), false);
  assert.equal(await exists(path.join(e, 'src/main.ts')), true);
}));

test('games carry only their chosen renderer and physics engine, and engines can be added one at a time', () => withGames(async games => {
  // A new game copies only its chosen renderer and physics engine, but keeps the dashboard.
  const f = path.join(games, 'zeta');
  await createGame(f, 'three', 'planck');
  const t = path.join(f, tools);
  assert.equal(await exists(path.join(t, 'src/renderers/three.ts')), true);
  assert.equal(await exists(path.join(t, 'src/renderers/pixi.ts')), false, 'no unused renderer');
  assert.equal(await exists(path.join(t, 'src/renderers/canvas.ts')), false, 'no unused renderer');
  assert.equal(await exists(path.join(t, 'src/physics/planck.ts')), true);
  assert.equal(await exists(path.join(t, 'scripts/export-ui/server.mjs')), true, 'dashboard kept');
  assert.equal(await exists(path.join(t, 'scripts/create-game.mjs')), true, 'generator kept for the dashboard');
  assert.deepEqual((await meta(f)).physics, ['planck']);
  // Regression: the chosen engine's package must be installable, not just recorded.
  assert.equal((await json(path.join(f, 'package.json'))).dependencies.planck, '1.5.1');
  assert.deepEqual((await json(path.join(t, 'src/renderers/registry.json'))).renderers.map((item: Status) => item.id), ['three']);
  const status = await inspectGame(f);
  assert.equal(status.components.find((item: Status) => item.id === 'renderers').status, 'current');
  assert.equal(status.components.find((item: Status) => item.id === 'physics').status, 'current');

  // Updating renderers and physics keeps it to the chosen engines.
  await updateGame(f, ['renderers', 'physics']);
  assert.equal(await exists(path.join(t, 'src/renderers/pixi.ts')), false);
  assert.equal(await exists(path.join(t, 'src/renderers/three.ts')), true);

  // Adding a renderer later copies just that one.
  await addRenderer(f, 'pixi');
  assert.equal(await exists(path.join(t, 'src/renderers/pixi.ts')), true);
  assert.equal(await exists(path.join(t, 'src/renderers/canvas.ts')), false);
  assert.deepEqual((await json(path.join(t, 'src/renderers/registry.json'))).renderers.map((item: Status) => item.id).sort(), ['pixi', 'three']);

  // An unknown physics engine is refused before anything is written.
  await assert.rejects(createGame(path.join(games, 'eta'), 'pixi', 'nope'), /Unknown physics engine/);
  assert.equal(await exists(path.join(games, 'eta')), false);

  // Physics engines are added one at a time, each only when asked.
  const g = path.join(games, 'theta');
  await createGame(g, 'pixi', 'none');
  const gt = path.join(g, tools);
  assert.equal(await exists(path.join(gt, 'src/physics/planck.ts')), false, 'none copies no engine');
  assert.deepEqual((await meta(g)).physics, []);
  await addPhysics(g, 'planck');
  assert.equal(await exists(path.join(gt, 'src/physics/planck.ts')), true);
  assert.equal(await exists(path.join(gt, 'src/physics/matter.ts')), false, 'matter not added');
  assert.deepEqual((await meta(g)).physics, ['planck']);
  assert.equal((await json(path.join(g, 'package.json'))).dependencies.planck, '1.5.1');
  assert.ok((await json(path.join(g, 'tsconfig.json'))).compilerOptions.paths['gameframework/physics/planck'], 'planck alias');
  await assert.rejects(addPhysics(g, 'planck'), /already in this game/);
  await addPhysics(g, 'matter');
  const withMatter = await json(path.join(g, 'package.json'));
  assert.equal(withMatter.dependencies['matter-js'], '0.20.0');
  assert.equal(withMatter.devDependencies['@types/matter-js'], '0.20.2');
  assert.deepEqual((await meta(g)).physics, ['planck', 'matter']);
  assert.equal(await exists(path.join(gt, 'src/physics/matter.ts')), true);
  assert.deepEqual((await json(path.join(gt, 'src/physics/registry.json'))).physics.map((item: Status) => item.id).sort(), ['matter', 'planck']);
  assert.match(await readFile(path.join(g, 'vite.config.ts'), 'utf8'), /gameframework\/physics\/matter/);
  const physicsStatus = await inspectGame(g);
  assert.deepEqual(physicsStatus.physics.filter((item: Status) => item.status === 'ready').map((item: Status) => item.id).sort(), ['matter', 'planck']);
  assert.equal(physicsStatus.components.find((item: Status) => item.id === 'physics').status, 'current');
}));

test('renderers and physics engines can be removed when nothing imports them, and never leave the game without a renderer', () => withGames(async games => {
  const a = path.join(games, 'remove-test');
  await createGame(a, 'pixi', 'planck');
  await removeExample(a); // the example imports renderers; start from the empty starter so only our imports count
  await addRenderer(a, 'canvas');
  await addPhysics(a, 'matter');
  assert.ok((await json(path.join(a, 'package.json'))).dependencies['matter-js']);

  // An unused renderer is removed with its file and alias. The game's own renderer is recorded as before.
  await removeRenderer(a, 'canvas');
  assert.equal(await exists(path.join(a, tools, 'src/renderers/canvas.ts')), false);
  assert.deepEqual((await json(path.join(a, tools, 'src/renderers/registry.json'))).renderers.map((item: Status) => item.id), ['pixi']);
  assert.equal((await meta(a)).renderer, 'pixi');
  assert.equal((await readFile(path.join(a, 'tsconfig.json'), 'utf8')).includes('gameframework/canvas'), false);
  assert.equal((await readFile(path.join(a, 'vite.config.ts'), 'utf8')).includes("'gameframework/canvas'"), false);

  // The last renderer cannot be removed.
  await assert.rejects(removeRenderer(a, 'pixi'), /only renderer/);

  // An engine that game code still imports is refused, and nothing is deleted.
  await writeFile(path.join(a, 'src/main.ts'), "import { createMatterWorld } from 'gameframework/physics/matter';\nexport const w = createMatterWorld;\n");
  await assert.rejects(removePhysics(a, 'matter'), /still imports Matter\.js/);
  assert.equal(await exists(path.join(a, tools, 'src/physics/matter.ts')), true, 'refused removal keeps the file');

  // Once the import is gone, it removes. Its package goes, and planck stays because the game still has it.
  await writeFile(path.join(a, 'src/main.ts'), 'export const x = 1;\n');
  const removedPhysics = await removePhysics(a, 'matter');
  assert.equal(await exists(path.join(a, tools, 'src/physics/matter.ts')), false);
  const afterMatter = await json(path.join(a, 'package.json'));
  assert.equal(afterMatter.dependencies['matter-js'], undefined, 'matter-js removed');
  assert.ok(afterMatter.dependencies.planck, 'planck kept');
  assert.deepEqual((await meta(a)).physics, ['planck']);
  assert.equal((await readFile(path.join(a, 'vite.config.ts'), 'utf8')).includes("'gameframework/physics/matter'"), false);
  assert.ok(removedPhysics.removed.includes('matter-js'));

  // A renderer that game code still imports is refused. A renderer whose package is shared stays installed.
  await addRenderer(a, 'three');
  await writeFile(path.join(a, 'src/main.ts'), "import { createThreeRenderer } from 'gameframework/three';\nexport const t = createThreeRenderer;\n");
  await assert.rejects(removeRenderer(a, 'three'), /still imports/);
  await writeFile(path.join(a, 'src/main.ts'), 'export const x = 1;\n');
  await removeRenderer(a, 'three');
  assert.equal((await json(path.join(a, 'package.json'))).dependencies.three, undefined, 'three removed');
  assert.ok((await json(path.join(a, 'package.json'))).dependencies['pixi.js'], 'pixi.js kept: pixi renderer still in game');
  assert.deepEqual((await json(path.join(a, tools, 'src/renderers/registry.json'))).renderers.map((item: Status) => item.id), ['pixi']);

  // Removing the renderer the game was made with moves the record to the one that remains.
  await addRenderer(a, 'canvas');
  await removeRenderer(a, 'pixi');
  assert.equal((await meta(a)).renderer, 'canvas');
  assert.deepEqual((await json(path.join(a, tools, 'src/renderers/registry.json'))).renderers.map((item: Status) => item.id), ['canvas']);
  assert.equal((await json(path.join(a, 'package.json'))).dependencies['pixi.js'], undefined, 'pixi.js dropped once nothing needs it');

  // Removing an engine that was never added is refused cleanly.
  await assert.rejects(removePhysics(a, 'matter'), /is not in this game/);
}));
