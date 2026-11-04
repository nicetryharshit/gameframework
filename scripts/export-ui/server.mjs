#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { access, readFile, readdir, realpath, stat, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildPlan, projectInfo, saveProfile, checkPlatform, validateProfile, validateIosSettings, nativeProjectExists, updateIosProject, moveIosProjectAside, runStep, cancelChild, collectArtifacts, clearPreviousOutput } from './builds.mjs';

const assets = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
function inside(root, file) { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
/** Opens a URL in the user's default browser. Failure is harmless: the link is also shown in the page. */
export function openExternal(url) {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [url], { shell: false, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}
/** Starts another game's dashboard on a free port and resolves with its address once it is listening. */
function startGameDashboard(gameRoot, serverFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverFile, '--port', '0'], { cwd: gameRoot, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('The game dashboard did not start.')); }, 10000);
    const onData = data => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve({ url: match[0], child }); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

export async function startExportUI(root = process.cwd(), port = 4179) {
  root = await realpath(root); await projectInfo(root);
  const token = randomBytes(32).toString('hex');
  let active; let serial = 0; let address; let saving = false;
  const jobs = [];
  const games = new Map();
  const log = (job, value) => { job.log = (job.log + value.replace(/\u001b\[[0-9;]*m/g, '')).slice(-200_000); };
  const isFramework = async () => (await projectInfo(root)).kind === 'framework';

  async function createGame(data) {
    if (!(await isFramework())) throw new Error('New games can only be created from the framework folder.');
    const slug = String(data.name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug || slug.length > 40) throw new Error('Use letters or numbers for the game name.');
    const { createGame: generate, readRegistry } = await import(pathToFileURL(path.join(root, 'scripts', 'create-game.mjs')).href);
    if (!(await readRegistry(root)).some(item => item.id === data.renderer)) throw new Error('Choose a renderer.');
    await generate(path.join(path.dirname(root), slug), data.renderer);
    return { folder: slug };
  }

  /** Resolves a game folder name to a real game folder next to the framework, or throws. */
  async function gameFolder(data) {
    if (!(await isFramework())) throw new Error('Games can only be managed from the framework folder.');
    const folder = String(data.folder ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(folder)) throw new Error('Enter the name of a game folder next to the framework folder.');
    const gameRoot = await realpath(path.join(path.dirname(root), folder)).catch(() => undefined);
    if (!gameRoot || path.dirname(gameRoot) !== path.dirname(root)) throw new Error('No game folder with that name next to the framework folder.');
    const serverFile = path.join(gameRoot, 'tools', 'gameframework', 'scripts', 'export-ui', 'server.mjs');
    if (!(await exists(serverFile))) throw new Error('That folder is not a Game Workshop game.');
    return { folder, gameRoot, serverFile };
  }

  async function openGame(data) {
    const { folder, gameRoot, serverFile } = await gameFolder(data);
    if (games.has(folder)) return { url: games.get(folder).url };
    const game = await startGameDashboard(gameRoot, serverFile);
    games.set(folder, game);
    game.child.on('close', () => games.delete(folder));
    openExternal(game.url);
    return { url: game.url };
  }

  /** Copies this framework's tools into a game. Its dashboard is stopped first so it restarts on the new code. */
  async function updateGame(data) {
    const { folder, gameRoot } = await gameFolder(data);
    if (data.components !== undefined && !Array.isArray(data.components)) throw new Error('Choose which parts to update.');
    const { updateGame: update } = await import(pathToFileURL(path.join(root, 'scripts', 'create-game.mjs')).href);
    const result = await update(gameRoot, data.components);
    games.get(folder)?.child.kill(); games.delete(folder);
    return result;
  }

  /** Adds one of the framework's renderers to a game: copies it, maps the alias and lists its packages. */
  async function addRenderer(data) {
    const { gameRoot } = await gameFolder(data);
    const { addRenderer: add } = await import(pathToFileURL(path.join(root, 'scripts', 'create-game.mjs')).href);
    return add(gameRoot, String(data.renderer ?? ''));
  }

  /** Lists game folders next to the framework folder so the home page can show them. */
  async function listGames() {
    if (!(await isFramework())) throw new Error('Games are listed from the framework folder.');
    const parent = path.dirname(root); const found = [];
    const { inspectGame, frameworkVersion, gameRenderer, readRegistry } = await import(pathToFileURL(path.join(root, 'scripts', 'create-game.mjs')).href);
    const renderers = await readRegistry(root);
    for (const entry of await readdir(parent, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) continue;
      const folder = path.join(parent, entry.name);
      if (!(await exists(path.join(folder, 'tools', 'gameframework', 'scripts', 'export-ui', 'server.mjs')))) continue;
      const update = await inspectGame(folder).catch(() => undefined);
      const renderer = await gameRenderer(folder);
      found.push({ folder: entry.name, update, renderer, kind: renderers.find(item => item.id === renderer)?.kind ?? '2d', running: games.has(entry.name) });
    }
    const { version, revision } = await frameworkVersion();
    return { games: found.sort((a, b) => a.folder.localeCompare(b.folder)), parent, framework: { version, revision }, renderers: renderers.map(({ id, label, kind, note }) => ({ id, label, kind, note })) };
  }

  async function execute(job) {
    try {
      // Installing and testing must run before setup is complete, so they skip the setup checks.
      const setupJob = !['install', 'test'].includes(job.action);
      if (setupJob) {
        const check = await checkPlatform(root, job.profile.platform, process.platform, job.action);
        job.checks = check;
        if (!check.ready) throw new Error('Prerequisite checks failed. Review the platform checklist.');
      }
      if (job.cancelled) throw new Error('Cancelled');
      if (setupJob && ['ios', 'android'].includes(job.profile.platform)) {
        const exists = await nativeProjectExists(root, job.profile.platform);
        if (job.action === 'initialize' && exists) throw new Error('Native project already exists. Open it instead; initialization will not overwrite your customizations.');
        if (job.action !== 'initialize' && !exists) throw new Error('Initialize the native project first.');
      }
      const steps = buildPlan(root, job.profile, job.action);
      if (['build', 'run'].includes(job.action)) await clearPreviousOutput(root, job.profile);
      for (const step of steps) {
        if (job.cancelled) throw new Error('Cancelled');
        await runStep(step, root, job, text => {
          log(job, text);
          // Vite only prints Local after successfully binding. A busy port must not link to another project's server.
          if (job.action === 'dev' && /Local:\s+http:\/\/127\.0\.0\.1:5173\//.test(job.log)) job.devUrl = 'http://127.0.0.1:5173/';
        });
      }
      if (['build', 'run'].includes(job.action) && !(job.action === 'run' && job.profile.platform !== 'web' && job.profile.mode === 'development')) {
        job.output = await collectArtifacts(root, job.profile, job);
        if (job.cancelled) throw new Error('Cancelled');
        log(job, `\nArtifacts: ${job.output.directory}\n`);
        if (job.action === 'run' && job.profile.platform !== 'web') {
          const binary = job.output.runnable;
          if (!binary) throw new Error('Build succeeded, but a runnable binary was not found. Open the output folder to run the app.');
          await runStep({ command: path.join(root, binary), args: [], title: 'Running built application (stop to close)' }, root, job, text => log(job, text));
        }
      }
      if (job.cancelled) throw new Error('Cancelled');
      job.status = 'succeeded'; log(job, '\n✓ Finished successfully.\n');
    } catch (error) { job.status = job.cancelled ? 'cancelled' : 'failed'; log(job, `\n${error.message}\n`); }
    finally { job.finished = new Date().toISOString(); active = undefined; }
  }

  const server = http.createServer(async (req, res) => {
    const json = (value, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== address.host) return json({ error: 'Invalid host' }, 403);
      const url = new URL(req.url, address.origin);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-export-token'] !== token || (req.headers.origin && req.headers.origin !== address.origin)) return json({ error: 'Unauthorized local request' }, 403);
        if (req.method === 'GET' && url.pathname === '/api/state') return json({ project: await projectInfo(root), active: active?.id, jobs: jobs.map(({ child, ...job }) => job) });
        if (req.method === 'GET' && url.pathname === '/api/games') return json(await listGames());
        if (req.method !== 'POST' || req.headers.origin !== address.origin || !req.headers['content-type']?.startsWith('application/json')) return json({ error: 'Invalid request' }, 403);
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16384) throw new Error('Request too large'); }
        const data = JSON.parse(body || '{}');
        if (url.pathname === '/api/check') return json(await checkPlatform(root, data.platform));
        if (url.pathname === '/api/create') return json(await createGame(data));
        if (url.pathname === '/api/open-game') return json(await openGame(data));
        if (url.pathname === '/api/update-game') return json(await updateGame(data));
        if (url.pathname === '/api/add-renderer') return json(await addRenderer(data));
        if (url.pathname === '/api/ios-settings') {
          if (active || saving) return json({ error: 'A build or profile save is already active' }, 409);
          const settings = validateIosSettings(data.settings);
          const info = await projectInfo(root);
          saving = true;
          try {
            for (const mode of ['development', 'release']) {
              const { ios, ...rest } = info.profiles[`ios-${mode}`];
              await saveProfile(root, settings ? { ...rest, ios: settings } : rest);
            }
            // An existing project is updated in place, so Xcode edits you made are kept.
            const update = await nativeProjectExists(root, 'ios')
              ? await updateIosProject(root, { ...info.profiles['ios-development'], ios: settings })
              : undefined;
            return json({ ok: true, ios: settings ?? null, project: update ?? null });
          } finally { saving = false; }
        }
        if (url.pathname === '/api/ios-regenerate') {
          if (active || saving) return json({ error: 'A build or profile save is already active' }, 409);
          if (!(await nativeProjectExists(root, 'ios'))) return json({ error: 'There is no Xcode project to regenerate yet. Use Set up.' }, 409);
          saving = true;
          let backup;
          try { backup = await moveIosProjectAside(root); } finally { saving = false; }
          // Start the normal setup job; it creates the project from the saved settings.
          const profile = validateProfile((await projectInfo(root)).profiles['ios-development']);
          const job = { id: `${Date.now()}-${++serial}`, profile, action: 'initialize', status: 'running', started: new Date().toISOString(), log: `Moved the existing project to src-tauri/gen/${backup}. Restore it by renaming that folder back to apple.\n`, cancelled: false };
          active = job; jobs.push(job); if (jobs.length > 20) jobs.shift();
          json({ id: job.id, backup }); void execute(job); return;
        }
        if (url.pathname === '/api/profile') {
          if (active || saving) return json({ error: 'A build or profile save is already active' }, 409);
          saving = true; try { return json(await saveProfile(root, data)); } finally { saving = false; }
        }
        if (url.pathname === '/api/stop') { if (active) { active.cancelled = true; log(active, '\nStopping…\n'); cancelChild(active.child); } return json({ ok: true }); }
        if (url.pathname === '/api/start') {
          if (active || saving) return json({ error: 'A build/session or profile save is already active' }, 409);
          const profile = validateProfile(data.profile); buildPlan(root, profile, data.action);
          const job = { id: `${Date.now()}-${++serial}`, profile, action: data.action, status: 'running', started: new Date().toISOString(), log: '', cancelled: false };
          active = job; jobs.push(job); if (jobs.length > 20) jobs.shift();
          json({ id: job.id }); void execute(job); return;
        }
        if (url.pathname === '/api/reveal') {
          const job = jobs.find(job => job.id === data.id);
          if (!job?.output) throw new Error('No output directory for this job');
          const directory = await realpath(path.join(root, job.output.directory));
          if (!inside(root, directory)) throw new Error('Invalid output directory');
          const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
          const child = spawn(command, [directory], { shell: false, windowsHide: true, stdio: 'ignore' });
          child.on('error', () => {}); child.unref(); return json({ ok: true });
        }
        return json({ error: 'Unknown action' }, 404);
      }
      if (req.method !== 'GET') return json({ error: 'Not found' }, 404);
      if (url.pathname.startsWith('/preview/')) {
        const [id, ...parts] = decodeURIComponent(url.pathname.slice('/preview/'.length)).split('/');
        const job = jobs.find(job => job.id === id);
        if (!job?.output || job.profile.platform !== 'web') throw new Error('Unknown web build');
        const base = await realpath(path.join(root, job.output.directory, 'web'));
        const requested = parts.join('/') || 'index.html';
        const file = await realpath(path.resolve(base, requested));
        if (!inside(base, file)) throw new Error('Invalid preview path');
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(await readFile(file)); return;
      }
      if (url.pathname.startsWith('/artifact/')) {
        const [id, ...parts] = decodeURIComponent(url.pathname.slice(10)).split('/');
        const job = jobs.find(job => job.id === id);
        if (!job?.output) throw new Error('Unknown build output');
        const base = await realpath(path.join(root, job.output.directory));
        const file = await realpath(path.resolve(base, parts.join('/')));
        if (!inside(base, file) || !(await stat(file)).isFile()) throw new Error('Invalid artifact');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': (await stat(file)).size, 'Content-Disposition': `attachment; filename="${path.basename(file).replaceAll('"', '')}"` }); createReadStream(file).on('error', () => res.destroy()).pipe(res); return;
      }
      const filename = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' }[url.pathname];
      if (!filename) return json({ error: 'Not found' }, 404);
      let content = await readFile(path.join(assets, filename));
      if (filename === 'index.html') content = content.toString().replace('__EXPORT_TOKEN__', token);
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" }); res.end(content);
    } catch (error) { if (!res.headersSent) json({ error: error.message }, 400); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  address = { host: `127.0.0.1:${server.address().port}`, origin: `http://127.0.0.1:${server.address().port}` };
  const close = async () => {
    if (active) { active.cancelled = true; cancelChild(active.child); }
    for (const game of games.values()) game.child.kill();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  };
  return { url: address.origin, close };
}

if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => '') === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const requestedPort = portIndex === -1 ? undefined : Number(process.argv[portIndex + 1]);
  const port = requestedPort ?? 4179;
  const showUrl = app => {
    console.log(`\nGame Workshop\n${app.url}\nProject: ${process.cwd()}\nKeep this window open while you use Game Workshop. Ctrl+C closes it.\n`);
    if (process.argv.includes('--open')) openExternal(app.url);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit()); });
  };
  try {
    showUrl(await startExportUI(process.cwd(), port));
  } catch (error) {
    if (error.code !== 'EADDRINUSE') { console.error(error.message); process.exitCode = 1; }
    else if (requestedPort !== undefined) { console.error(`Port ${port} is in use. Close the other Game Workshop window, or choose another port.`); process.exitCode = 1; }
    else {
      // Another project's dashboard holds the default port. Use any free port so both can run at once.
      showUrl(await startExportUI(process.cwd(), 0));
    }
  }
}
