import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import * as framework from '../src/framework/index';

// Every framework module must be re-exported from the index, or games cannot import it from 'gameframework'.
test('every framework module is exported from the index', async () => {
  const index = await readFile('src/framework/index.ts', 'utf8');
  const modules = (await readdir('src/framework')).filter(name => name.endsWith('.ts') && name !== 'index.ts');
  for (const file of modules) {
    assert.ok(index.includes(`from './${file.replace(/\.ts$/, '')}'`), `index.ts does not export ./${file}`);
  }
});

test('the core helpers and the asset loader are available from the index', () => {
  for (const name of ['loadAssets', 'createTimers', 'createRandom', 'createFrameAnimation', 'tween', 'createLocalizer']) {
    assert.equal(typeof (framework as Record<string, unknown>)[name], 'function', `${name} is missing from the index`);
  }
  // easing is a set of curves, so it is an object whose members are functions.
  const easing = (framework as Record<string, unknown>).easing as Record<string, unknown>;
  assert.equal(typeof easing, 'object', 'easing is missing from the index');
  for (const curve of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeOutBack', 'easeOutBounce']) {
    assert.equal(typeof easing[curve], 'function', `easing.${curve} is missing`);
  }
});
