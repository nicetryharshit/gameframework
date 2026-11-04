#!/usr/bin/env node
// Reports the production size of a game: every JavaScript and CSS file in its dist/ folder, raw and gzipped.
// Usage: node scripts/measure-size.mjs <gameFolder> [--no-build] [--json <file>]
// KB here means 1024 bytes. Gzip is the level most hosts and stores use, so it is the size players download.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHIPPED_EXTENSIONS = ['.js', '.css'];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

/** Sizes of every shipped file under distDir, largest first. Throws if the folder is missing or has no shipped files. */
export async function measureDist(distDir) {
  const all = await listFiles(distDir).catch(error => {
    throw new Error(`No build output at ${distDir}. Build the game first, or run without --no-build. (${error.code ?? error.message})`);
  });
  const shipped = all.filter(file => SHIPPED_EXTENSIONS.includes(path.extname(file)));
  if (shipped.length === 0) throw new Error(`No JavaScript or CSS files in ${distDir}.`);
  const files = [];
  for (const file of shipped) {
    const bytes = await readFile(file);
    files.push({ file: path.relative(distDir, file).split(path.sep).join('/'), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length });
  }
  files.sort((a, b) => b.bytes - a.bytes);
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  const totalGzipBytes = files.reduce((sum, item) => sum + item.gzipBytes, 0);
  return { files, totalBytes, totalGzipBytes };
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;

/** A plain-text table of the report from measureDist. */
export function formatReport(report) {
  const rows = report.files.map(item => `${item.file.padEnd(40)} ${kb(item.bytes).padStart(12)} ${kb(item.gzipBytes).padStart(12)}`);
  const header = `${'File'.padEnd(40)} ${'Raw'.padStart(12)} ${'Gzipped'.padStart(12)}`;
  const total = `${'Total'.padEnd(40)} ${kb(report.totalBytes).padStart(12)} ${kb(report.totalGzipBytes).padStart(12)}`;
  return [header, ...rows, total].join('\n');
}

function runBuild(gameDir) {
  return new Promise((resolve, reject) => {
    // shell: true lets Windows find npm.cmd.
    const child = spawn('npm', ['run', 'build'], { cwd: gameDir, shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`npm run build failed with exit code ${code}.`))));
  });
}

async function main(argv) {
  const noBuild = argv.includes('--no-build');
  const jsonAt = argv.indexOf('--json');
  const jsonFile = jsonAt >= 0 ? argv[jsonAt + 1] : null;
  const folder = argv.find((arg, index) => !arg.startsWith('--') && !(jsonAt >= 0 && index === jsonAt + 1));
  if (!folder) throw new Error('Usage: node scripts/measure-size.mjs <gameFolder> [--no-build] [--json <file>]');
  const gameDir = path.resolve(folder);
  if (!noBuild) await runBuild(gameDir);
  const report = await measureDist(path.join(gameDir, 'dist'));
  console.log(formatReport(report));
  if (jsonFile) await writeFile(path.resolve(jsonFile), JSON.stringify({ game: path.basename(gameDir), measuredAt: new Date().toISOString(), ...report }, null, 2) + '\n');
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
