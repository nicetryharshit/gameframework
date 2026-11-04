import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatReport, measureDist } from '../scripts/measure-size.mjs';

async function withDist(run: (dist: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'measure-size-'));
  try {
    const dist = path.join(root, 'dist');
    await mkdir(path.join(dist, 'assets'), { recursive: true });
    await writeFile(path.join(dist, 'assets', 'big.js'), 'x'.repeat(5000) + 'y'.repeat(5000));
    await writeFile(path.join(dist, 'assets', 'small.css'), 'body{margin:0}');
    await writeFile(path.join(dist, 'index.html'), '<html></html>');
    await run(dist);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('measures each shipped file, largest first, and ignores other files', () => withDist(async dist => {
  const report = await measureDist(dist);
  assert.deepEqual(report.files.map(item => item.file), ['assets/big.js', 'assets/small.css']);
  assert.equal(report.files[0].bytes, 10000);
  assert.ok(report.files[0].gzipBytes < report.files[0].bytes, 'repetitive text compresses');
  assert.equal(report.totalBytes, report.files.reduce((sum, item) => sum + item.bytes, 0));
}));

test('a missing build is reported with the fix', async () => {
  await assert.rejects(measureDist(path.join(tmpdir(), 'no-such-game-dist')), /Build the game first/);
});

test('the report has a row per file and a total', () => withDist(async dist => {
  const text = formatReport(await measureDist(dist));
  assert.match(text, /assets\/big\.js/);
  assert.match(text, /Total/);
  assert.match(text, /Gzipped/);
}));
