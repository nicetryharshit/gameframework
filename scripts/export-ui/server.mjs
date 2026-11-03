#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPlan, projectInfo, saveProfile, checkPlatform, validateProfile, nativeProjectExists, runStep, cancelChild, collectArtifacts } from './builds.mjs';

const assets = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
function inside(root, file) { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
export async function startExportUI(root = process.cwd(), port = 4179) {
  root = await realpath(root); await projectInfo(root);
  const token = randomBytes(32).toString('hex');
  let active; let serial = 0; let address; let saving = false;
  const jobs = [];
  const log = (job, value) => { job.log = (job.log + value.replace(/\u001b\[[0-9;]*m/g, '')).slice(-200_000); };
  async function execute(job) {
    try {
      const check = await checkPlatform(root, job.profile.platform, process.platform, job.action);
      job.checks = check;
      if (!check.ready) throw new Error('Prerequisite checks failed. Review the platform checklist.');
      if (job.cancelled) throw new Error('Cancelled');
      if (['ios', 'android'].includes(job.profile.platform)) {
        const exists = await nativeProjectExists(root, job.profile.platform);
        if (job.action === 'initialize' && exists) throw new Error('Native project already exists. Open it instead; initialization will not overwrite your customizations.');
        if (job.action !== 'initialize' && !exists) throw new Error('Initialize the native project first.');
      }
      const steps = buildPlan(root, job.profile, job.action);
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
        if (req.method !== 'POST' || req.headers.origin !== address.origin || !req.headers['content-type']?.startsWith('application/json')) return json({ error: 'Invalid request' }, 403);
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16384) throw new Error('Request too large'); }
        const data = JSON.parse(body || '{}');
        if (url.pathname === '/api/check') return json(await checkPlatform(root, data.platform));
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
  const close = async () => { if (active) { active.cancelled = true; cancelChild(active.child); } server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  return { url: address.origin, close };
}
if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => '') === fileURLToPath(import.meta.url)) {
  const portArgument = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : process.argv.slice(2).find(value => /^\d+$/.test(value));
  const port = portArgument === undefined ? 4179 : Number(portArgument);
  try {
    const app = await startExportUI(process.cwd(), port);
    console.log(`\nBuild & Export\n${app.url}\nProject: ${process.cwd()}\nOpen this local URL in your browser. Ctrl+C stops the dashboard and its active build.\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit()); });
  } catch (error) { console.error(error.message.includes('EADDRINUSE') ? 'Port 4179 is in use. Try: npm run export:ui -- --port 4180' : error.message); process.exitCode = 1; }
}
