const token = document.querySelector('meta[name="export-token"]').content;
const $ = selector => document.querySelector(selector);

const PLATFORMS = [
  { id: 'web', name: 'Web', blurb: 'Play in a browser, or upload to itch.io' },
  { id: 'windows', name: 'Windows', blurb: 'Desktop app with an installer', host: 'win32', hostName: 'Windows' },
  { id: 'macos', name: 'macOS', blurb: 'Desktop app for Mac', host: 'darwin', hostName: 'Mac' },
  { id: 'linux', name: 'Linux', blurb: 'Desktop app for Linux', host: 'linux', hostName: 'Linux' },
  { id: 'ios', name: 'iPhone and iPad', blurb: 'Opens in Xcode to run and publish', host: 'darwin', hostName: 'Mac', project: true },
  { id: 'android', name: 'Android', blurb: 'Phone app (APK), opens in Android Studio', project: true }
];
const ADDONS = [{ id: 'steam', name: 'Steam', blurb: 'Sell your desktop builds on Steam' }];
const TOOLS = { id: 'framework', name: 'Install and test', blurb: 'Install dependencies, and run the framework tests', profileId: 'web' };
const DONE = {
  build: 'Your build is ready.',
  run: 'Your game is built. Open the preview to play it.',
  dev: 'Your game is running. Changes you save update it live.',
  install: 'Dependencies are installed. You can play and build now.',
  test: 'All tests passed.',
  'initialize:ios': 'Project created. Next, open it in Xcode.',
  'initialize:android': 'Project created. Next, open it in Android Studio.',
  'open:ios': 'Xcode should be open. Build and run from there.',
  'open:android': 'Your project folder is open. In Android Studio, choose File › Open.'
};

let state = null;
const checks = {};
let mode = 'development';
let openId = null;
let selectedJob = null;
const panelOf = new Map();
const seenJobs = new Set();
let booted = false;
let lastSignature = '';

function say(message = '') { const box = $('#notice'); box.textContent = message; box.hidden = !message; }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(label, onClick, className = 'primary') { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', onClick); return node; }
function link(label, href) { const node = el('a', 'link-button', label); node.href = href; node.target = '_blank'; node.rel = 'noopener'; return node; }
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

function statusOf(platform) {
  const result = checks[platform.id];
  if (!result) return { kind: 'loading', text: 'Checking…' };
  if (hostBlocked(platform)) return { kind: 'blocked', text: `Needs a ${platform.hostName} computer` };
  if (!result.ready) return { kind: 'setup', text: 'Setup needed' };
  if (platform.project && !projectReady(platform.id)) return { kind: 'new', text: 'Not set up yet' };
  return { kind: 'ready', text: platform.project ? 'Project ready' : 'Ready' };
}

function actionsFor(platform) {
  if (platform.id === 'ios') return projectReady('ios') ? [{ label: 'Open in Xcode', action: 'open' }] : [{ label: 'Set up iOS project', action: 'initialize' }];
  if (platform.id === 'android') return projectReady('android')
    ? [{ label: 'Build APK', action: 'build' }, { label: 'Open in Android Studio', action: 'open' }]
    : [{ label: 'Set up Android project', action: 'initialize' }];
  if (platform.id === 'web') return [{ label: 'Play in browser', action: 'dev' }, { label: 'Build web game', action: 'build' }, { label: 'Build and preview', action: 'run' }];
  if (platform.id === 'framework') return [{ label: 'Install dependencies', action: 'install' }, ...(state?.project.hasTests ? [{ label: 'Run tests', action: 'test' }] : [])];
  return [{ label: `Build ${platform.name} app`, action: 'build' }];
}

/** Installing dependencies comes first whenever they are missing, because nothing else can run without them. */
function optionsFor(platform) {
  const options = actionsFor(platform);
  return platform.id !== 'framework' && missingDependencies(platform.id) ? [{ label: 'Install dependencies', action: 'install' }, ...options] : options;
}

function primaryFor(platform, status) {
  if (status.kind === 'blocked') return { label: 'See what’s needed', run: () => openPanel(platform.id), style: 'secondary' };
  if (missingDependencies(platform.id)) return { label: 'Install dependencies', run: () => run(platform, 'install'), style: 'primary' };
  if (status.kind === 'setup') return { label: 'See what’s needed', run: () => openPanel(platform.id), style: 'secondary' };
  const first = actionsFor(platform)[0];
  return { label: first.label, run: () => run(platform, first.action), style: 'primary' };
}

function platformCard(platform) {
  const status = statusOf(platform);
  const card = el('article', `card ${status.kind}`);
  card.append(el('h3', '', platform.name), el('p', 'blurb', platform.blurb), el('p', 'status', status.text));
  if (status.kind === 'loading') { const wait = button('Checking…', () => {}, 'secondary'); wait.disabled = true; card.append(wait); }
  else { const primary = primaryFor(platform, status); card.append(button(primary.label, primary.run, primary.style)); }
  card.append(button('Details', () => openPanel(platform.id), 'link'));
  return card;
}

function addonCard(addon) {
  const ready = !!checks.steam?.ready;
  const text = !checks.steam ? 'Checking…' : ready ? 'Ready to connect' : 'Needs the Steamworks SDK';
  const card = el('article', `card ${ready ? 'ready' : 'setup'}`);
  card.append(el('h3', '', addon.name), el('p', 'blurb', addon.blurb), el('p', 'status', text), button('See steps', () => openPanel('steam'), 'secondary'));
  return card;
}

function toolCard(tool) {
  const card = el('article', 'card');
  card.append(el('h3', '', tool.name), el('p', 'blurb', tool.blurb), button('Open', () => openPanel(tool.id), 'secondary'));
  return card;
}

function stepItem(check) {
  const item = el('li', check.ok ? 'step ok' : check.blocking ? 'step missing' : 'step optional');
  item.append(el('strong', '', `${check.ok ? '✓' : check.blocking ? '✕' : '○'} ${check.name}`));
  if (!check.ok) item.append(el('small', '', check.detail));
  return item;
}

function renderResult(platform, job) {
  const box = $('#result');
  box.replaceChildren();
  box.hidden = !job;
  if (!job) return;
  const key = `${job.action}:${platform.id}`;
  const text = job.status === 'running' ? (job.devUrl ? 'Your game is running. Changes you save update it live.' : 'Working on it. This can take a few minutes.')
    : job.status === 'succeeded' ? (DONE[key] || DONE[job.action] || 'Done.')
    : job.status === 'cancelled' ? 'Stopped.'
    : 'That didn’t finish. Open details to see why.';
  box.append(el('p', 'result-text', text));
  const links = el('div', 'links');
  if (job.status === 'running' && job.devUrl) links.append(link('Open live game', job.devUrl));
  if (job.status === 'succeeded' && job.action === 'run' && job.profile.platform === 'web') links.append(link('Open preview', `/preview/${job.id}/`));
  if (job.status === 'succeeded' && job.output) {
    links.append(button('Open output folder', () => api('reveal', { id: job.id }).catch(error => say(error.message)), 'secondary'));
    for (const file of job.output.artifacts.filter(item => !item.directory && item.name !== 'build-report.json')) {
      const download = el('a', 'file-link', `Download ${file.name} (${(file.bytes / 1048576).toFixed(1)} MB)`);
      download.href = `/artifact/${job.id}/${encodeURIComponent(file.name)}`;
      links.append(download);
    }
  }
  if (links.childElementCount) box.append(links);
}

function renderPanel() {
  const panel = $('#panel');
  panel.hidden = !openId;
  if (!openId) return;
  const isSteam = openId === 'steam';
  const isTools = openId === 'framework';
  const platform = isSteam ? ADDONS[0] : isTools ? TOOLS : PLATFORMS.find(item => item.id === openId);
  const job = state?.jobs.find(item => item.id === selectedJob);
  const running = job?.status === 'running';
  const isAndroidRelease = openId === 'android' && mode === 'release';

  $('#panel-title').textContent = platform.name;
  $('#panel-lead').textContent = platform.blurb;
  const steps = $('#steps'); steps.replaceChildren();
  $('#needs-heading').hidden = isTools;
  steps.hidden = isTools;
  $('#recheck').hidden = isTools;
  if (!isTools) {
    if (!checks[openId]) steps.append(el('li', 'step', 'Checking…'));
    for (const item of checks[openId]?.checks ?? []) steps.append(stepItem(item));
  }
  $('#modes').hidden = isSteam || isTools || openId === 'ios';
  for (const option of $('#modes').querySelectorAll('button')) {
    const selected = option.dataset.mode === mode;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  }
  $('#hint').hidden = !isAndroidRelease;
  $('#hint').textContent = 'Release builds for Android need signing, which isn’t set up yet. Use a test build for now.';

  const actions = $('#actions'); actions.replaceChildren();
  if (isSteam) actions.append(el('p', 'hint', 'Steam uploads are not automated yet. Once the SDK is in place, upload your Windows, macOS or Linux build with Steam’s upload tools.'));
  else if (isTools || (checks[openId] && !hostBlocked(platform))) {
    const options = isTools ? actionsFor(TOOLS) : optionsFor(platform);
    options.forEach((option, index) => {
      const node = button(option.label, () => run(platform, option.action), index === 0 ? 'primary' : 'secondary');
      node.disabled = running || (isAndroidRelease && option.action === 'build');
      actions.append(node);
    });
  }
  renderResult(platform, job);
  $('#stop').hidden = !running;
  $('#log').textContent = job ? (job.log || 'Starting…') : 'Nothing has run yet.';
}

function renderCards() {
  if (isFramework()) {
    $('#tools').replaceChildren(toolCard(TOOLS));
    return;
  }
  $('#cards').replaceChildren(...PLATFORMS.map(platformCard));
  $('#addons').replaceChildren(...ADDONS.map(addonCard));
}

function draw(force = false) {
  const signature = JSON.stringify([
    state?.project.kind,
    Object.keys(checks).sort().map(id => [id, checks[id].ready, checks[id].checks.map(item => item.ok)]),
    state?.jobs.map(job => [job.id, job.status, !!job.output, job.log.length, job.devUrl ?? null]) ?? [],
    openId, mode, selectedJob
  ]);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  $('#workshop').hidden = !isFramework();
  $('#game-home').hidden = isFramework();
  $('#edit-game').hidden = isFramework();
  renderCards();
  renderPanel();
}

function openPanel(id) {
  openId = id;
  selectedJob = id === 'steam' ? null : (state?.jobs.findLast(job => (panelOf.get(job.id) ?? job.profile.platform) === id)?.id ?? null);
  if (id !== 'framework' && !checks[id]) void loadCheck(id);
  say('');
  draw(true);
}

async function loadCheck(id) {
  try { checks[id] = await api('check', { platform: id }); }
  catch (error) { say(error.message); }
  draw(true);
}

async function loadAllChecks() {
  await Promise.all([...PLATFORMS, ...ADDONS].map(item => loadCheck(item.id)));
}

async function run(platform, action) {
  say('');
  if (!state) return;
  try {
    const profile = state.project.profiles[`${platform.profileId ?? platform.id}-${mode}`];
    const { id } = await api('start', { profile, action });
    panelOf.set(id, platform.id);
    openId = platform.id; selectedJob = id; draw(true);
  } catch (error) { say(error.message); }
}

async function refresh() {
  state = await api('state');
  $('#game-name').textContent = state.project.name;
  for (const job of state.jobs) {
    if (job.status === 'running' || seenJobs.has(job.id)) continue;
    seenJobs.add(job.id);
    if (!booted) continue;
    if (job.action === 'install') void loadAllChecks();
    else void loadCheck(job.profile.platform);
  }
  booted = true;
  draw();
}

function showOpened(folder, url, verb) {
  const box = $('#workshop-result');
  box.replaceChildren(el('p', 'result-text', `${verb} ${folder}. Its dashboard should open in your browser.`), link(`Open ${folder}`, url));
  box.hidden = false;
}

$('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const { folder } = await api('create', Object.fromEntries(new FormData(event.currentTarget)));
    const { url } = await api('open-game', { folder });
    showOpened(folder, url, 'Created');
  } catch (error) { say(error.message); }
});
$('#open-form').addEventListener('submit', async event => {
  event.preventDefault();
  const folder = new FormData(event.currentTarget).get('folder').trim();
  try { const { url } = await api('open-game', { folder }); showOpened(folder, url, 'Opened'); }
  catch (error) { say(error.message); }
});

$('#close').onclick = () => { openId = null; draw(true); };
$('#recheck').onclick = () => { if (openId && openId !== 'framework') void loadCheck(openId); };
$('#stop').onclick = () => api('stop', {}).catch(error => say(error.message));
$('#copy').onclick = () => navigator.clipboard.writeText($('#log').textContent).then(() => say('Log copied.'), () => say('Select the log text and copy it manually.'));
for (const option of $('#modes').querySelectorAll('button')) option.onclick = () => { mode = option.dataset.mode; draw(true); };
document.addEventListener('keydown', event => { if (event.key === 'Escape' && openId && !$('#game-dialog').open) { openId = null; draw(true); } });

$('#edit-game').onclick = () => {
  const form = $('#game-form'); const profile = state.project.profiles['web-development'];
  for (const key of ['name', 'version', 'identifier']) form.elements[key].value = profile[key];
  $('#game-error').hidden = true;
  $('#game-dialog').showModal();
};
$('#cancel-game').onclick = () => $('#game-dialog').close();
$('#game-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    for (const key of Object.keys(state.project.profiles)) await api('profile', { ...state.project.profiles[key], ...values });
    state = await api('state');
    $('#game-dialog').close();
    say('Game details saved.');
  } catch (error) { $('#game-error').textContent = error.message; $('#game-error').hidden = false; }
});

setInterval(() => { refresh().catch(() => say('Lost connection to Game Workshop. Restart it and reload this page.')); }, 1000);
try {
  await refresh();
  await loadAllChecks();
} catch (error) { say(error.message); }
