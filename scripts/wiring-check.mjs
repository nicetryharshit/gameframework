// Read-only checks that a generated game's framework parts agree with each other: the renderers and physics engines
// copied into it, their tsconfig paths and Vite aliases, their packages, and the imports in the game's own code.
// The Build dashboard runs these before a build, and the generator runs them after a change. Nothing here writes files.
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const tools = 'tools/gameframework';
const exists = file => access(file).then(() => true, () => false);

/** Parsed JSON, `fallback` when the file is missing, or undefined when it is not valid JSON. */
async function readJson(file, fallback) {
  const text = await readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) return fallback;
  try { return JSON.parse(text); } catch { return undefined; }
}

async function sourceFiles(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...await sourceFiles(file));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item.name)) found.push(file);
  }
  return found;
}

/** Everything a game needs to load on its own, read once for both checks. */
async function loadGame(root) {
  const problems = [];
  const meta = await readJson(path.join(root, tools, 'VERSION.json'), undefined);
  if (!meta) return { problems: ['The framework tools are missing. Update tools to restore them.'] };
  const rendererFile = await readJson(path.join(root, tools, 'src/renderers/registry.json'), { renderers: [] });
  const physicsFile = await readJson(path.join(root, tools, 'src/physics/registry.json'), { physics: [] });
  const pkg = await readJson(path.join(root, 'package.json'), {});
  const tsconfig = await readJson(path.join(root, 'tsconfig.json'), {});
  if (rendererFile === undefined) problems.push('tools/gameframework/src/renderers/registry.json is not valid JSON.');
  if (physicsFile === undefined) problems.push('tools/gameframework/src/physics/registry.json is not valid JSON.');
  if (pkg === undefined) problems.push('package.json is not valid JSON.');
  if (tsconfig === undefined) problems.push('tsconfig.json is not valid JSON.');
  const renderers = rendererFile?.renderers ?? [];
  const physics = physicsFile?.physics ?? [];
  const engines = [
    ...renderers.map(entry => ({ label: entry.label, alias: `gameframework/${entry.id}`, file: `src/renderers/${entry.entry}`, packages: [...(entry.packages ?? []), ...(entry.devPackages ?? [])] })),
    ...physics.filter(entry => entry.entry).map(entry => ({ label: entry.label, alias: `gameframework/physics/${entry.id}`, file: `src/physics/${entry.entry}`, packages: [...(entry.packages ?? []), ...(entry.devPackages ?? [])] }))
  ];
  return { problems, meta, renderers, engines, pkg: pkg ?? {}, tsconfig: tsconfig ?? {} };
}

/** Problems that would break a build or leave the game inconsistent. An empty list means the game is wired correctly. */
export async function wiringProblems(root) {
  const game = await loadGame(root);
  if (!game.meta) return game.problems;
  const { meta, renderers, engines, pkg, tsconfig } = game;
  const problems = [...game.problems];
  const paths = tsconfig.compilerOptions?.paths ?? {};
  const vite = await readFile(path.join(root, 'vite.config.ts'), 'utf8').catch(() => '');
  for (const engine of engines) {
    if (!(await exists(path.join(root, tools, engine.file)))) problems.push(`${engine.label}: ${engine.file} is missing from the tools. Update tools.`);
    if (!paths[engine.alias]) problems.push(`${engine.label}: tsconfig.json has no path for ${engine.alias}.`);
    if (!vite.includes(`'${engine.alias}'`)) problems.push(`${engine.label}: vite.config.ts has no alias for ${engine.alias}.`);
    for (const name of engine.packages) {
      if (!pkg.dependencies?.[name] && !pkg.devDependencies?.[name]) problems.push(`${engine.label} needs ${name}, which package.json does not list. Remove it and add it again from Update tools.`);
    }
  }
  if (meta.renderer && !renderers.some(entry => entry.id === meta.renderer)) problems.push(`This game's renderer (${meta.renderer}) is not in its copied tools.`);
  // Game code may import only the engines this game has. The core and desktop hooks are always present.
  const allowed = new Set([...engines.map(engine => engine.alias), 'gameframework/desktop']);
  for (const file of await sourceFiles(path.join(root, 'src'))) {
    const text = await readFile(file, 'utf8').catch(() => '');
    for (const match of text.matchAll(/['"](gameframework\/(?:physics\/)?[a-z0-9-]+)['"]/g)) {
      if (!allowed.has(match[1])) problems.push(`${path.relative(root, file).replaceAll('\\', '/')} imports ${match[1]}, which this game does not include. Add that engine from Update tools, or change the import.`);
    }
  }
  return [...new Set(problems)];
}

/** The same findings as rows for the platform checklist. A game with nothing wrong gets one passing row. */
export async function wiringChecks(root) {
  const game = await loadGame(root);
  if (!game.meta) return [{ name: 'Game wiring', ok: false, detail: game.problems[0], blocking: false }];
  const problems = await wiringProblems(root);
  const checks = problems.length
    ? problems.map(detail => ({ name: 'Game wiring', ok: false, detail, blocking: true }))
    : [{ name: 'Game wiring', ok: true, detail: 'Renderers, physics engines and imports agree', blocking: true }];
  const installed = [...new Set(game.engines.flatMap(engine => engine.packages))];
  const missing = [];
  for (const name of installed) if (!(await exists(path.join(root, 'node_modules', name)))) missing.push(name);
  if (missing.length) checks.push({ name: 'Engine packages installed', ok: false, detail: `${missing.join(', ')} not installed. Run Install dependencies.`, blocking: true });
  return checks;
}
