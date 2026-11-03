import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Generator is a plain Node module.
import { createGame } from '../scripts/create-game.mjs';

test('both starters contain the chosen renderer and exports, and refuse overwrite', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'webgame-scaffold-'));
  try {
    for (const renderer of ['2d', '3d']) {
      const target = path.join(temp, renderer);
      await createGame(target, renderer, 'git+https://example.com/framework.git#v1');
      const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
      assert.equal(pkg.dependencies['web-game-framework'], 'git+https://example.com/framework.git#v1');
      assert.ok(pkg.dependencies[renderer === '2d' ? 'pixi.js' : 'three']);
      assert.equal(Object.keys(pkg.dependencies).length, 2);
      assert.ok(pkg.scripts['build:desktop']); assert.ok(pkg.scripts['build:web']);
      assert.match(await readFile(path.join(target, 'src', `demo-${renderer}.ts`), 'utf8'), /web-game-framework\/(pixi|three)/);
      await assert.rejects(createGame(target, renderer), /already exists/);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
