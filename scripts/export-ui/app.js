const token = document.querySelector('meta[name="export-token"]').content;
const win = document.defaultView;
const $ = selector => document.querySelector(selector);

const PLATFORMS = [
  { id: 'web', name: 'Web', blurb: 'Play in a browser, or upload to itch.io' },
  { id: 'windows', name: 'Windows', blurb: 'Desktop app with an installer', host: 'win32', hostName: 'Windows' },
  { id: 'macos', name: 'macOS', blurb: 'Desktop app for Mac', host: 'darwin', hostName: 'macOS' },
  { id: 'linux', name: 'Linux', blurb: 'Desktop app for Linux', host: 'linux', hostName: 'Linux' },
  { id: 'ios', name: 'iOS', blurb: 'Export an Xcode project, then build and sign in Xcode.', host: 'darwin', hostName: 'macOS', project: true },
  { id: 'android', name: 'Android', blurb: 'Build an APK, or open the project in Android Studio.', project: true }
];
const ADDON = { id: 'steam', name: 'Steam', blurb: 'Desktop add-on. The SDK is yours to install; nothing is bundled.' };
const TOOLS = { id: 'framework', name: 'Maintenance', blurb: 'Install dependencies and run the framework tests.', profileId: 'web' };
const ACTION = { build: 'Build', dev: 'Play', run: 'Build and preview', install: 'Install dependencies', test: 'Run tests', initialize: 'Set up project', open: 'Open' };
const DONE = {
  build: 'Build finished.',
  run: 'Built. Open the preview to play it.',
  dev: 'Dev server stopped.',
  install: 'Dependencies are installed.',
  test: 'All tests passed.',
  'initialize:ios': 'iOS project created. Open it in Xcode next.',
  'initialize:android': 'Android project created. Open it in Android Studio next.',
  'open:ios': 'Xcode should be open. Build and run from there.',
  'open:android': 'Project folder is open. In Android Studio choose File › Open.'
};

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  term: '<path d="M4 6l6 6-6 6M13 18h7"/>',
  layers: '<path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  dash: '<path d="M6 12h12"/>'
};
function icon(name, width = 1.8) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span.firstChild;
}

let state = null;
let games = null;
const checks = {};
let mode = 'development';
let route = '';
const jobPlatform = new Map();
const seenJobs = new Set();
let booted = false;
let lastSignature = '';
let created = null;
let lastUpdate = null;
let updating = null;

function say(message = '') { const box = $('#notice'); box.textContent = message; box.hidden = !message; }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(label, onClick, className = 'btn') { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', event => { event.stopPropagation(); onClick(event); }); return node; }
function link(label, href) { const node = el('a', 'link', label); node.href = href; node.target = '_blank'; node.rel = 'noopener'; return node; }
function dot(kind) { return el('i', `dot ${kind}`); }
async function api(route, body) {
  const options = { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Export-Token': token } };
  if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(`/api/${route}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

const isFramework = () => state?.project.kind === 'framework';
const check = (id, name) => checks[id]?.checks.find(item => item.name === name);
const projectReady = id => !!check(id, 'Native project')?.ok;
const hostBlocked = platform => !!checks[platform.id]?.checks.some(item => item.name === 'Build host' && !item.ok);
const missingDependencies = id => check(id, 'TypeScript')?.ok === false;
const platformOf = job => jobPlatform.get(job.id) ?? job.profile.platform;
const jobFor = id => state?.jobs.findLast(job => platformOf(job) === id);
const running = () => state?.jobs.find(job => job.status === 'running');

function statusOf(platform) {
  const result = checks[platform.id];
  if (!result) return { kind: 'loading', dot: '', text: 'Checking…' };
  if (hostBlocked(platform)) return { kind: 'blocked', dot: 'bad', text: platform.hostName ? `Needs ${platform.hostName}` : 'Blocked on this machine' };
  if (!result.ready) return { kind: 'setup', dot: 'warn', text: 'Needs setup' };
  if (platform.project && !projectReady(platform.id)) return { kind: 'new', dot: 'warn', text: 'Project not created' };
  return { kind: 'ready', dot: 'ok', text: 'Ready' };
}

function actionsFor(platform) {
  if (platform.id === 'ios') return projectReady('ios')
    ? [{ label: 'Open in Xcode', action: 'open' }] : [{ label: 'Set up iOS project', action: 'initialize' }];
  if (platform.id === 'android') return projectReady('android')
    ? [{ label: 'Build APK', action: 'build' }, { label: 'Open in Android Studio', action: 'open' }]
    : [{ label: 'Set up Android project', action: 'initialize' }];
  if (platform.id === 'web') return [{ label: 'Play in browser', action: 'dev' }, { label: 'Build', action: 'build' }, { label: 'Build and preview', action: 'run' }];
  if (platform.id === 'framework') return [{ label: 'Install dependencies', action: 'install' }, ...(state?.project.hasTests ? [{ label: 'Run tests', action: 'test' }] : [])];
  return [{ label: `Build ${platform.name}`, action: 'build' }];
}
/** Installing dependencies comes first whenever they are missing, because nothing else can run without them. */
function optionsFor(platform) {
  const options = actionsFor(platform);
  return platform.id !== 'framework' && missingDependencies(platform.id) ? [{ label: 'Install dependencies', action: 'install' }, ...options] : options;
}

/** The single next thing to do for a platform, shown as the row's button. */
function nextFor(platform, status) {
  if (status.kind === 'loading') return null;
  if (missingDependencies(platform.id)) return { label: 'Install', primary: true, go: () => run(platform, 'install') };
  if (status.kind === 'blocked' || status.kind === 'setup') return { label: 'Set up', primary: false, go: () => navigate(platform.id) };
  const first = actionsFor(platform)[0];
  const label = first.action === 'dev' ? 'Play' : first.action === 'build' ? 'Build' : first.action === 'initialize' ? 'Set up' : 'Open';
  return { label, primary: first.action !== 'initialize', go: () => run(platform, first.action) };
}

function nextStepText(platform, status) {
  const failing = checks[platform.id]?.checks.find(item => !item.ok && item.blocking);
  if (failing) return failing.detail;
  if (status.kind === 'new') return 'Create the native project once';
  const last = jobFor(platform.id);
  if (last?.status === 'running') return `Running ${ACTION[last.action] ?? last.action}…`;
  if (last) return `Last: ${ACTION[last.action] ?? last.action} ${last.status}`;
  return 'Not built yet';
}

function navigate(next) {
  route = next;
  try { if (win.location.hash.slice(1) !== next) win.location.hash = next; } catch { /* the hash is cosmetic */ }
  say('');
  if (next && next !== 'framework' && !checks[next]) void loadCheck(next);
  draw(true);
  $('#main').scrollTop = 0;
}

/* ---------- themes ---------- */
const THEMES = [['ink', 'Ink'], ['paper', 'Paper'], ['slate', 'Slate'], ['moss', 'Moss']];
function savedTheme() { try { return win.localStorage.getItem('workshop-theme'); } catch { return null; } }
function systemTheme() { try { return win.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'ink'; } catch { return 'ink'; } }
function setTheme(name, remember = true) {
  document.documentElement.dataset.theme = name;
  if (remember) try { win.localStorage.setItem('workshop-theme', name); } catch { /* the theme still applies for this visit */ }
  lastSignature = '';
  if (state) draw(true);
}
document.documentElement.dataset.theme = savedTheme() ?? systemTheme();

/* ---------- sidebar ---------- */
function renderSide() {
  const side = $('#side');
  document.body.classList.toggle('game', !isFramework());
  const brand = el('div', 'brand');
  const logo = el('span', 'logo'); logo.append(icon(isFramework() ? 'layers' : 'play'));
  brand.append(logo, el('b', '', isFramework() ? 'Workshop' : state.project.name), el('span', 'tag', isFramework() ? 'Framework' : 'Game'));
  const nav = (label, target, extra) => {
    const item = el('button', `nav${route === target ? ' on' : ''}`); item.type = 'button';
    if (extra?.icon) item.append(icon(extra.icon));
    item.append(label); if (extra?.dot !== undefined) item.append(dot(extra.dot));
    item.addEventListener('click', () => navigate(target));
    return item;
  };
  const foot = el('div', 'side-foot');
  foot.append(isFramework() ? 'Create and manage games. Builds happen inside each game.' : '', el('span', 'mono', state.project.root));
  if (isFramework() && games?.framework) foot.append(el('span', 'mono', `framework ${games.framework.version} · ${games.framework.revision}`));
  const themes = el('div', 'themes'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', 'Theme');
  for (const [id, label] of THEMES) {
    const choice = button(label, () => setTheme(id), document.documentElement.dataset.theme === id ? 'on' : '');
    choice.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === id)); themes.append(choice);
  }
  foot.append(themes);
  if (isFramework()) side.replaceChildren(brand, nav('Games', '', { icon: 'home', dot: games?.games.some(game => game.update?.outdated) ? 'warn' : undefined }), nav('Maintenance', 'framework', { icon: 'term' }), foot);
  else side.replaceChildren(
    brand, nav('Overview', '', { icon: 'home' }), el('div', 'navlabel', 'Platforms'),
    ...PLATFORMS.map(platform => nav(platform.name, platform.id, { dot: running() && platformOf(running()) === platform.id ? 'run' : statusOf(platform).dot })),
    el('div', 'navlabel', 'Add-ons'), nav(ADDON.name, 'steam', { dot: checks.steam?.ready ? 'ok' : '' }), foot);
}

/* ---------- framework home ---------- */
const createForm = (() => {
  const form = el('form', 'form wide');
  form.id = 'create-form';
  form.innerHTML = `<label>Folder name<input name="name" required maxlength="40" value="my-game" autocomplete="off"></label>
    <label>Renderer<span class="seg" role="group" aria-label="Renderer"><button type="button" data-r="2d" class="on">Pixi · 2D</button><button type="button" data-r="3d">Three · 3D</button></span></label>
    <span class="mono muted small" data-preview></span>
    <button type="submit" class="btn primary">Create game</button>`;
  form.dataset.renderer = '2d';
  const sync = () => {
    const slug = form.elements.name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    form.querySelector('[data-preview]').textContent = slug ? `Creates ../${slug}` : 'Use letters or numbers';
  };
  form.elements.name.addEventListener('input', sync); sync();
  for (const choice of form.querySelectorAll('.seg button')) choice.addEventListener('click', () => {
    form.dataset.renderer = choice.dataset.r;
    for (const other of form.querySelectorAll('.seg button')) other.classList.toggle('on', other === choice);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const { folder } = await api('create', { name: form.elements.name.value, renderer: form.dataset.renderer });
      const { url } = await api('open-game', { folder });
      created = { folder, url }; await loadGames(); draw(true);
    } catch (error) { say(error.message); }
  });
  return form;
})();

async function openGame(folder) {
  try { const { url } = await api('open-game', { folder }); created = { folder, url, opened: true }; await loadGames(); draw(true); }
  catch (error) { say(error.message); }
}

function openUpdate(game) {
  updating = game;
  const info = game.update;
  $('#update-sub').textContent = `${game.folder} has tools ${info.version} · ${info.revision}. This framework is ${info.framework.version} · ${info.framework.revision}. Pick what to update.`;
  const list = $('#update-list'); list.replaceChildren();
  for (const item of info.components) {
    const row = el('label', 'pick');
    const box = el('input'); box.type = 'checkbox'; box.value = item.id; box.checked = item.status === 'outdated' || item.status === 'missing';
    const text = el('span', 't'); text.append(el('span', '', item.label), el('small', '', item.status === 'modified' ? 'Edited in this game. Updating overwrites those edits.' : item.note));
    const chip = el('span', `chip ${item.status === 'current' ? 'ok' : item.status === 'modified' ? 'bad' : 'warn'}`, { current: 'Current', outdated: 'Outdated', modified: 'Edited here', missing: 'New' }[item.status]);
    row.append(box, text, chip); list.append(row);
  }
  renderRendererList();
  $('#update-error').hidden = true;
  $('#update-dialog').showModal();
}

function renderRendererList() {
  const list = $('#renderer-list'); list.replaceChildren();
  for (const item of updating.update.renderers ?? []) {
    const row = el('div', 'pick');
    const text = el('span', 't'); text.append(el('span', '', item.label), el('small', '', `${item.kind.toUpperCase()} · ${item.note}`));
    row.append(text);
    if (item.status === 'ready') row.append(el('span', 'chip ok', 'In this game'));
    else row.append(button('Add', () => addRenderer(item.id), 'btn sm'));
    list.append(row);
  }
}

async function addRenderer(id) {
  try {
    const result = await api('add-renderer', { folder: updating.folder, renderer: id });
    lastUpdate = { folder: updating.folder, updated: [`renderer ${id}`], from: '', to: '', notes: result.notes };
    await loadGames();
    updating = games.games.find(game => game.folder === updating.folder) ?? updating;
    renderRendererList(); draw(true);
  } catch (error) { $('#update-error').textContent = error.message; $('#update-error').hidden = false; }
}
$('#cancel-update').onclick = () => $('#update-dialog').close();
$('#update-form').addEventListener('submit', async event => {
  event.preventDefault();
  const components = Array.from($('#update-list').querySelectorAll('input:checked')).map(box => box.value);
  try {
    const result = await api('update-game', { folder: updating.folder, components });
    $('#update-dialog').close();
    lastUpdate = { folder: updating.folder, ...result }; created = null;
    await loadGames(); draw(true);
  } catch (error) { $('#update-error').textContent = error.message; $('#update-error').hidden = false; }
});

async function loadGames() {
  if (!isFramework()) return;
  try { games = await api('games'); } catch (error) { say(error.message); }
}

function renderHome() {
  const view = el('div');
  const head = el('div', 'head');
  const title = el('div', 'grow'); title.append(el('h1', '', 'Games'), el('p', 'sub', 'Projects created from this framework. Each one is self-contained.'));
  head.append(title);
  view.append(el('div', 'crumb', state.project.root), head);

  if (created) {
    const box = el('div', 'result ok');
    box.append(el('p', '', `${created.opened ? 'Opened' : 'Created'} ${created.folder}. Its dashboard should open in your browser.`), link(`Open ${created.folder} dashboard`, created.url));
    view.append(box);
  }

  if (lastUpdate) {
    const box = el('div', 'result ok');
    box.append(el('p', '', `Updated ${lastUpdate.folder}: ${lastUpdate.updated.join(', ')}${lastUpdate.to !== lastUpdate.from ? ` (${lastUpdate.from} → ${lastUpdate.to})` : ''}. Click Open to use the new tools.`));
    if (lastUpdate.notes.length) { const notes = el('ul'); for (const note of lastUpdate.notes) notes.append(el('li', '', note)); box.append(notes); }
    view.append(box);
  }

  const list = el('div', 'card');
  if (!games) list.append(el('p', 'empty', 'Looking for games…'));
  else if (!games.games.length) list.append(el('p', 'empty', 'No games yet. Create your first one.'));
  else {
    const table = el('table');
    table.innerHTML = '<thead><tr><th>Name</th><th>Renderer</th><th>Tools</th><th></th></tr></thead>';
    const body = el('tbody');
    for (const game of games.games) {
      const row = el('tr', 'click');
      const info = game.update;
      const name = el('td'); name.append(el('b', '', game.folder), el('div', 'muted mono small', `../${game.folder}`));
      const kind = el('td', 'mono', game.renderer === '3d' ? 'three · 3D' : 'pixi · 2D');
      const toolsCell = el('td');
      const st = el('span', 'st'); st.append(dot(!info ? '' : info.outdated ? 'warn' : 'ok'), !info ? 'Unknown' : info.outdated ? 'Update available' : 'Up to date');
      toolsCell.append(st, el('div', 'muted mono small', info ? `${info.version} · ${info.revision}` : ''));
      const open = el('td', 'right actions-cell');
      if (info) open.append(button('Update tools', () => openUpdate(game), info.outdated ? 'btn sm warn' : 'link small'), ' ');
      open.append(button('Open', () => openGame(game.folder), `btn sm${info?.outdated ? '' : ' primary'}`));
      row.append(name, kind, toolsCell, open); row.addEventListener('click', () => openGame(game.folder));
      body.append(row);
    }
    table.append(body); list.append(table);
  }

  const make = el('div', 'card'); make.append(el('h2', '', 'New game'), createForm);
  const grid = el('div', 'stack'); grid.append(list, make);
  view.append(grid);
  return view;
}

/* ---------- game overview ---------- */
function renderOverview() {
  const view = el('div');
  const head = el('div', 'head');
  const title = el('div', 'grow');
  title.append(el('h1', '', state.project.name), el('p', 'sub', 'Choose a platform to check what is needed and build for it.'));
  const play = button('Play in browser', () => run(PLATFORMS[0], 'dev'), 'btn primary'); play.prepend(icon('play'));
  head.append(title, button('Game details', openDetails, 'btn'), play);
  view.append(el('div', 'crumb', state.project.root), head);

  const statuses = PLATFORMS.map(statusOf);
  const ready = statuses.filter(item => item.kind === 'ready').length;
  const needSetup = statuses.filter(item => ['setup', 'new', 'blocked'].includes(item.kind)).length;
  const builds = state.jobs.filter(job => job.status === 'succeeded' && ['build', 'run'].includes(job.action)).length;
  const sum = el('div', 'sum');
  for (const [value, label] of [[ready, 'Ready'], [needSetup, 'Need setup'], [builds, 'Builds this session']]) {
    const tile = el('div'); tile.append(el('b', '', String(value)), el('span', '', label)); sum.append(tile);
  }
  view.append(sum);

  const table = el('table');
  table.innerHTML = '<thead><tr><th>Platform</th><th>Status</th><th>Next step</th><th></th></tr></thead>';
  const body = el('tbody');
  const steamStatus = { kind: checks.steam?.ready ? 'ready' : 'idle', dot: checks.steam?.ready ? 'ok' : '', text: checks.steam?.ready ? 'Ready' : 'Not installed' };
  const rows = [...PLATFORMS.map((platform, index) => ({ platform, status: statuses[index] })), { platform: ADDON, status: steamStatus, addon: true }];
  for (const { platform, status, addon } of rows) {
    const row = el('tr', 'click');
    const name = el('td'); name.append(el('b', '', platform.name)); if (addon) name.append(' ', el('span', 'muted', 'add-on'));
    const statusCell = el('td'); const st = el('span', 'st'); st.append(dot(status.dot), status.text); statusCell.append(st);
    const next = el('td', 'muted', addon ? (checks.steam?.checks.find(item => !item.ok && item.blocking)?.detail ?? 'Hooks can be enabled') : nextStepText(platform, status));
    const action = el('td', 'right');
    if (addon) action.append(button(checks.steam?.ready ? 'Open' : 'Add', () => navigate('steam'), 'btn sm'));
    else { const todo = nextFor(platform, status); if (todo) action.append(button(todo.label, todo.go, `btn sm${todo.primary ? ' primary' : ''}`)); }
    row.append(name, statusCell, next, action); row.addEventListener('click', () => navigate(addon ? 'steam' : platform.id));
    body.append(row);
  }
  table.append(body);
  const card = el('div', 'card'); card.append(table); view.append(card);
  return view;
}

/* ---------- platform / steam / maintenance pages ---------- */
function stepItem(item) {
  const kind = item.ok ? 'ok' : item.blocking ? 'bad' : 'idle';
  const row = el('div', 'step');
  const mark = el('i', `ic ${kind}`); mark.append(icon(item.ok ? 'check' : item.blocking ? 'x' : 'dash', 3.5));
  const text = el('div'); text.append(el('span', '', item.name)); if (!item.ok) text.append(el('small', '', item.detail));
  row.append(mark, text);
  return row;
}

function renderResult(platform, job) {
  const box = el('div', `result${job.status === 'succeeded' ? ' ok' : job.status === 'failed' ? ' bad' : ''}`);
  const key = `${job.action}:${platform.id}`;
  const text = job.status === 'running' ? (job.devUrl ? 'Dev server is running. Saved changes update it live.' : `Running ${ACTION[job.action] ?? job.action}…`)
    : job.status === 'succeeded' ? (DONE[key] || DONE[job.action] || 'Done.')
    : job.status === 'cancelled' ? 'Stopped.'
    : 'Failed. Read the output below.';
  box.append(el('p', '', text));
  const links = el('div', 'links');
  if (job.status === 'running' && job.devUrl) links.append(link('Open live game', job.devUrl));
  if (job.status === 'succeeded' && job.action === 'run' && job.profile.platform === 'web') links.append(link('Open preview', `/preview/${job.id}/`));
  if (job.status === 'succeeded' && job.output) {
    links.append(button('Open output folder', () => api('reveal', { id: job.id }).catch(error => say(error.message)), 'link'));
    for (const file of job.output.artifacts.filter(item => !item.directory && item.name !== 'build-report.json')) {
      const download = el('a', 'link', `Download ${file.name} (${(file.bytes / 1048576).toFixed(1)} MB)`);
      download.href = `/artifact/${job.id}/${encodeURIComponent(file.name)}`; links.append(download);
    }
  }
  if (links.childElementCount) box.append(links);
  return box;
}

/** Clear hides output already on screen. The server keeps the full log, so a reload brings it back. */
const clearedAt = new Map();
const platformLogKey = job => job?.id ?? 'none';
let currentPlatform = null;

function renderLog(job, platformId) {
  currentPlatform = platformId;
  const frag = document.createDocumentFragment();
  const bar = el('div', 'logbar'); bar.append(el('h3', '', 'Output'));
  if (job?.status === 'running') bar.append(button('Stop', () => api('stop', {}).catch(error => say(error.message)), 'link danger'));
  const clear = button('Clear', () => { if (job) clearedAt.set(platformLogKey(job), job.log.length); checkLog.delete(currentPlatform); draw(true); }, 'link');
  clear.disabled = job?.status === 'running';
  bar.append(clear, button('Copy', () => navigator.clipboard.writeText($('#log').textContent).then(() => say('Log copied.'), () => say('Select the log text and copy it manually.')), 'link'));
  const log = el('div', 'log'); log.id = 'log'; log.tabIndex = 0;
  const shown = job ? (job.log || 'Starting…').slice(clearedAt.get(platformLogKey(job)) ?? 0) : '';
  const checks_ = checkLog.get(currentPlatform) ?? '';
  log.textContent = [checks_, shown].filter(Boolean).join('\n') || 'Idle. Nothing has been run here yet.';
  frag.append(bar, log);
  return frag;
}

function renderPlatform(id) {
  const isSteam = id === 'steam';
  const isTools = id === 'framework';
  const platform = isSteam ? ADDON : isTools ? TOOLS : PLATFORMS.find(item => item.id === id);
  if (!platform) return renderOverview();
  const job = jobFor(id);
  const release = id === 'android' && mode === 'release';
  const view = el('div');

  const crumb = el('div', 'crumb');
  if (isTools) crumb.append(button('Games', () => navigate(''), ''), ' / maintenance');
  else crumb.append(button(state.project.name, () => navigate(''), ''), ` / ${isSteam ? 'add-ons' : 'platforms'} / ${id}`);
  const head = el('div', 'head'); const title = el('div', 'grow'); title.append(el('h1', '', platform.name), el('p', 'sub', platform.blurb));
  head.append(title);
  if (!isSteam && !isTools && id !== 'ios') {
    const seg = el('span', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Build type');
    for (const [value, label] of [['development', 'Debug'], ['release', 'Release']]) {
      const choice = button(label, () => { mode = value; draw(true); }, value === mode ? 'on' : '');
      choice.setAttribute('aria-pressed', String(value === mode)); seg.append(choice);
    }
    head.append(seg);
  }
  view.append(crumb, head);

  if (!isTools) {
    const card = el('div', 'card');
    const items = checks[id]?.checks ?? [];
    card.append(el('h2', '', `Readiness${checks[id] ? ` · ${items.filter(item => item.ok).length} of ${items.length}` : ''}`));
    const steps = el('div', 'steps');
    if (!checks[id]) steps.append(el('p', 'empty', 'Checking…'));
    for (const item of items) steps.append(stepItem(item));
    card.append(steps); view.append(card);
  }

  const actions = el('div', 'actions');
  if (isSteam) actions.append(el('p', 'hint', 'Uploads are not automated yet. Once the SDK is in place, upload your Windows, macOS or Linux build with Steam’s own upload tools.'));
  else if (isTools || (checks[id] && !hostBlocked(platform))) {
    (isTools ? actionsFor(TOOLS) : optionsFor(platform)).forEach((option, index) => {
      const node = button(option.label, () => run(platform, option.action), index === 0 ? 'btn primary' : 'link');
      node.disabled = !!running() || (release && option.action === 'build');
      if (index === 0 && option.action === 'dev') node.prepend(icon('play'));
      actions.append(node);
    });
    if (!isTools) {
      const busy = checking.has(id);
      const recheck = button(busy ? 'Checking…' : 'Re-check', () => loadCheck(id, true), 'link');
      recheck.disabled = busy;
      recheck.setAttribute('aria-busy', String(busy));
      actions.append(recheck);
    }
  }
  view.append(actions);
  if (release) view.append(el('p', 'hint', 'Android release builds need signing, which isn’t set up yet. Use a debug build for now.'));
  if (job) view.append(renderResult(platform, job));
  view.append(renderLog(job, id));
  return view;
}

/* ---------- job bar ---------- */
function renderJobBar() {
  const bar = $('#jobbar');
  const active = running();
  const last = state?.jobs.at(-1);
  bar.replaceChildren();
  if (active) {
    const id = platformOf(active);
    bar.append(dot('run'), el('span', 'grow', `${id} · ${ACTION[active.action] ?? active.action}${active.devUrl ? ` · ${active.devUrl}` : ''}`));
    const progress = el('div', 'bar'); progress.append(el('i'));
    bar.append(progress, button('Show output', () => navigate(id), 'jb'), button('Stop', () => api('stop', {}).catch(error => say(error.message)), 'jb danger'));
  } else if (last) {
    bar.append(dot(last.status === 'succeeded' ? 'ok' : last.status === 'failed' ? 'bad' : ''), el('span', 'grow', `Last: ${platformOf(last)} · ${ACTION[last.action] ?? last.action} · ${last.status}`), button('Show output', () => navigate(platformOf(last)), 'jb'));
  } else bar.append(dot(''), el('span', 'grow', 'No job running'));
}

function draw(force = false) {
  if (!state) return;
  const signature = JSON.stringify([
    state.project.kind, state.project.name, route, mode, created, lastUpdate, [...checking], [...checkLog.keys()].map(key => [key, checkLog.get(key).length]), games?.games.map(game => [game.folder, game.update?.revision, game.update?.outdated]),
    Object.keys(checks).sort().map(id => [id, checks[id].ready, checks[id].checks.map(item => item.ok)]),
    state.jobs.map(job => [job.id, job.status, !!job.output, job.log.length, job.devUrl ?? null])
  ]);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  renderSide();
  const log = $('#log');
  const stick = log ? log.scrollHeight - log.scrollTop - log.clientHeight < 40 : true;
  const page = isFramework() ? (route === 'framework' ? renderPlatform('framework') : renderHome()) : (route ? renderPlatform(route) : renderOverview());
  $('#view').replaceChildren(page);
  const fresh = $('#log'); if (fresh && stick) fresh.scrollTop = fresh.scrollHeight;
  renderJobBar();
}

const checkLog = new Map();
const CHECK_TIME = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Re-check records what it found, so a user can see it ran and what changed. */
function summarise(id, before, after) {
  const ready = after.checks.filter(item => item.ok).length;
  const lines = [`[${CHECK_TIME()}] Checked ${id}: ${ready} of ${after.checks.length} ready.`];
  if (before) {
    for (const item of after.checks) {
      const old = before.checks.find(other => other.name === item.name);
      if (old && old.ok !== item.ok) lines.push(`  ${item.ok ? '✓ now ready' : '✕ now missing'}: ${item.name}`);
    }
  }
  for (const item of after.checks) if (!item.ok && item.blocking) lines.push(`  ✕ ${item.name}: ${item.detail}`);
  return lines.join('\n');
}

/** Platforms with a check in flight. A second press while one is running is ignored. */
const checking = new Set();

async function loadCheck(id, record = false) {
  if (checking.has(id)) return;
  const before = checks[id];
  checking.add(id);
  if (record) {
    checkLog.set(id, `${checkLog.get(id) ?? ''}[${CHECK_TIME()}] Checking ${id}…\n`);
    draw(true);
  }
  try {
    checks[id] = await api('check', { platform: id });
    if (record) checkLog.set(id, checkLog.get(id).replace(/\[[^\]]*\] Checking [^\n]*\n$/, '') + summarise(id, before, checks[id]) + '\n');
  }
  catch (error) { say(error.message); if (record) checkLog.delete(id); }
  finally { checking.delete(id); draw(true); }
}
async function loadAllChecks() { await Promise.all([...PLATFORMS, ADDON].map(item => loadCheck(item.id))); }

async function run(platform, action) {
  say('');
  if (!state) return;
  try {
    const profile = state.project.profiles[`${platform.profileId ?? platform.id}-${mode}`];
    const { id } = await api('start', { profile, action });
    jobPlatform.set(id, platform.id);
    state = await api('state');
    navigate(platform.id);
  } catch (error) { say(error.message); }
}

async function refresh() {
  state = await api('state');
  for (const job of state.jobs) {
    if (job.status === 'running' || seenJobs.has(job.id)) continue;
    seenJobs.add(job.id);
    if (!booted) continue;
    if (job.action === 'install') void loadAllChecks();
    else if (!isFramework()) void loadCheck(job.profile.platform);
  }
  booted = true;
  draw();
}

/* ---------- game details dialog ---------- */
function openDetails() {
  const form = $('#game-form'); const profile = state.project.profiles['web-development'];
  for (const key of ['name', 'version', 'identifier']) form.elements[key].value = profile[key];
  $('#game-error').hidden = true;
  $('#game-dialog').showModal();
}
$('#cancel-game').onclick = () => $('#game-dialog').close();
$('#game-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    for (const key of Object.keys(state.project.profiles)) await api('profile', { ...state.project.profiles[key], ...values });
    state = await api('state');
    $('#game-dialog').close();
    say('Game details saved.'); draw(true);
  } catch (error) { $('#game-error').textContent = error.message; $('#game-error').hidden = false; }
});

win.addEventListener?.('hashchange', () => { const next = win.location.hash.slice(1); if (next !== route) { route = next; draw(true); } });
setInterval(() => { refresh().catch(() => say('Lost connection to Game Workshop. Restart it and reload this page.')); }, 1000);
try {
  route = win.location?.hash?.slice(1) ?? '';
  await refresh();
  if (isFramework()) await loadGames(); else await loadAllChecks();
  draw(true);
} catch (error) { say(error.message); }
