import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Generator is a plain Node module.
import { createGame } from '../scripts/create-game.mjs';
// @ts-expect-error Wiring check is a plain Node module.
import { wiringProblems, wiringChecks } from '../scripts/wiring-check.mjs';

const tools = 'tools/gameframework';
type Check = { name: string; ok: boolean; detail: string; blocking: boolean };

const readJson = (file: string): Promise<Record<string, any>> => readFile(file, 'utf8').then(text => JSON.parse(text));
const writeJson = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2));

/** A new game with PixiJS and Planck, which is the most that a fresh game can carry. */
async function withGame(task: (dir: string) => Promise<void>) {
  const games = await mkdtemp(path.join(tmpdir(), 'webgame-wiring-'));
  try {
    const dir = path.join(games, 'game');
    await createGame(dir, 'pixi', 'planck');
    await task(dir);
  } finally {
    await rm(games, { recursive: true, force: true });
  }
}

test('a new game with a renderer and a physics engine has no wiring problems', () => withGame(async dir => {
  assert.deepEqual(await wiringProblems(dir), []);
  const checks: Check[] = await wiringChecks(dir);
  assert.equal(checks[0].name, 'Game wiring');
  assert.equal(checks[0].ok, true);
  assert.equal(checks[0].blocking, true);
}));

test('the wiring check reports packages that are not installed as a blocking row', () => withGame(async dir => {
  const checks: Check[] = await wiringChecks(dir);
  const row = checks.find(item => item.name === 'Engine packages installed');
  assert.ok(row, 'a fresh game has no node_modules yet');
  assert.equal(row.ok, false);
  assert.equal(row.blocking, true);
  assert.match(row.detail, /pixi\.js/);
  assert.match(row.detail, /planck/);
}));

test('importing an engine the game does not include is flagged', () => withGame(async dir => {
  await writeFile(path.join(dir, 'src/extra.ts'), "import { createCanvasRenderer } from 'gameframework/canvas';\nexport default createCanvasRenderer;\n");
  const problems: string[] = await wiringProblems(dir);
  assert.ok(problems.some(item => /src\/extra\.ts imports gameframework\/canvas/.test(item)), problems.join('\n'));
}));

test('an engine with no tsconfig path is flagged', () => withGame(async dir => {
  const file = path.join(dir, 'tsconfig.json');
  const tsconfig = await readJson(file);
  delete tsconfig.compilerOptions.paths['gameframework/physics/planck'];
  await writeJson(file, tsconfig);
  const problems: string[] = await wiringProblems(dir);
  assert.ok(problems.some(item => item.includes('tsconfig.json has no path for gameframework/physics/planck')), problems.join('\n'));
}));

test('an engine with no Vite alias is flagged', () => withGame(async dir => {
  const file = path.join(dir, 'vite.config.ts');
  const vite = await readFile(file, 'utf8');
  await writeFile(file, vite.replaceAll("'gameframework/pixi'", "'gameframework/removed'"));
  const problems: string[] = await wiringProblems(dir);
  assert.ok(problems.some(item => item.includes("vite.config.ts has no alias for gameframework/pixi")), problems.join('\n'));
}));

test('an engine file missing from the copied tools is flagged', () => withGame(async dir => {
  await rm(path.join(dir, tools, 'src/renderers/pixi.ts'));
  const problems: string[] = await wiringProblems(dir);
  assert.ok(problems.some(item => item.includes('src/renderers/pixi.ts is missing from the tools')), problems.join('\n'));
}));

test('an engine whose package is not in package.json is flagged', () => withGame(async dir => {
  const file = path.join(dir, 'package.json');
  const pkg = await readJson(file);
  delete pkg.dependencies?.['pixi.js'];
  delete pkg.devDependencies?.['pixi.js'];
  await writeJson(file, pkg);
  const problems: string[] = await wiringProblems(dir);
  assert.ok(problems.some(item => /needs pixi\.js, which package\.json does not list/.test(item)), problems.join('\n'));
}));

test('a game without its framework tools reports that as its only check', () => withGame(async dir => {
  await rm(path.join(dir, tools, 'VERSION.json'));
  const checks: Check[] = await wiringChecks(dir);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].ok, false);
  assert.match(checks[0].detail, /framework tools are missing/);
}));
