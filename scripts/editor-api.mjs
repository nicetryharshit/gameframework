import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EditorApiError, MAX_ASSET_BYTES, MAX_SCENE_BYTES, assetKindOf, checkAssetPath, checkSceneText, mimeFor, sceneFileName } from './editor-api-core.mjs';

/**
 * Dev-server endpoints for the scene editor. They read and write the project's scenes/ and assets/ folders.
 * Only available under `npm run dev`; a built game never includes them.
 */
export default function editorApi() {
  let root = process.cwd();
  return {
    name: 'gameframework-editor-api',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/__editor/')) return next();
        try {
          await handle(root, req, res);
        } catch (error) {
          const status = error instanceof EditorApiError ? error.status : 500;
          sendJson(res, status, { error: error instanceof Error ? error.message : 'Editor request failed.' });
        }
      });
    }
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new EditorApiError(413, 'That file is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function assetsRoot(root) {
  return path.join(root, 'assets');
}

function resolveAsset(root, relativePath) {
  const base = assetsRoot(root);
  const file = path.resolve(base, relativePath);
  if (!file.startsWith(base + path.sep)) throw new EditorApiError(400, 'That path is outside the assets folder.');
  return file;
}

async function listScenes(root) {
  const folder = path.join(root, 'scenes');
  const names = await readdir(folder).catch(() => []);
  return names.filter(name => name.endsWith('.scene.json')).map(name => name.slice(0, -'.scene.json'.length)).sort();
}

async function listAssets(root) {
  const base = assetsRoot(root);
  const found = [];
  const walk = async (folder, prefix) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(folder, entry.name), relative);
      } else {
        const kind = assetKindOf(entry.name);
        if (!kind) continue;
        const info = await stat(path.join(folder, entry.name));
        found.push({ path: relative, kind, size: info.size });
      }
    }
  };
  await walk(base, '');
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

async function handle(root, req, res) {
  const url = new URL(req.url, 'http://localhost');
  const [, route, ...rest] = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));

  if (route === 'scenes' && req.method === 'GET' && rest.length === 0) {
    return sendJson(res, 200, { scenes: await listScenes(root) });
  }

  if (route === 'scene' && rest.length === 1) {
    const name = rest[0];
    const file = path.join(root, 'scenes', sceneFileName(name));
    if (req.method === 'GET') {
      const text = await readFile(file, 'utf8').catch(() => {
        throw new EditorApiError(404, `There is no scene called ${name}.`);
      });
      const headers = { 'content-type': 'application/json' };
      if (url.searchParams.has('download')) headers['content-disposition'] = `attachment; filename="${sceneFileName(name)}"`;
      res.writeHead(200, headers);
      return res.end(text);
    }
    if (req.method === 'POST') {
      const text = (await readBody(req, MAX_SCENE_BYTES)).toString('utf8');
      checkSceneText(text);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
      return sendJson(res, 200, {
        name,
        path: `scenes/${sceneFileName(name)}`,
        downloadUrl: `/__editor/scene/${encodeURIComponent(name)}?download=1`
      });
    }
  }

  if (route === 'assets' && req.method === 'GET' && rest.length === 0) {
    return sendJson(res, 200, { assets: await listAssets(root) });
  }

  if (route === 'asset' && req.method === 'GET' && rest.length > 0) {
    const relativePath = rest.join('/');
    checkAssetPath(relativePath);
    const bytes = await readFile(resolveAsset(root, relativePath)).catch(() => {
      throw new EditorApiError(404, 'That asset is missing.');
    });
    res.writeHead(200, { 'content-type': mimeFor(relativePath), 'cache-control': 'no-cache' });
    return res.end(bytes);
  }

  if (route === 'asset' && req.method === 'POST' && rest.length === 0) {
    const relativePath = url.searchParams.get('path') ?? '';
    const { kind } = checkAssetPath(relativePath);
    const bytes = await readBody(req, MAX_ASSET_BYTES);
    const file = resolveAsset(root, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return sendJson(res, 200, { path: relativePath, kind, size: bytes.length });
  }

  throw new EditorApiError(404, 'Unknown editor request.');
}
