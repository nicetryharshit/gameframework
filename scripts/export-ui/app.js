const token = document.querySelector('meta[name="export-token"]').content;
const $ = selector => document.querySelector(selector);
const targets = {
  web: { title: 'Web', icon: '◎', subtitle: 'Browser / itch.io', description: 'Run the game immediately with live updates, or export a portable build for your hosting service.', help: 'Run Dev Server starts Vite without building. Build & Run exports a snapshot and provides a preview link. App name/version/identifier are report metadata for web; page branding comes from your source.' },
  windows: { title: 'Windows', icon: '⊞', subtitle: 'Desktop / Steam', description: 'Build a Windows executable and installers. Requires Windows, Rust, MSVC build tools and WebView2.', help: 'Desktop release builds skip signing. Development Build & Run starts a live Tauri session; stop it from the console when finished.' },
  macos: { title: 'macOS', icon: '◒', subtitle: 'Desktop', description: 'Build the desktop app on your Mac. Requires Rust and Apple build tools.', help: 'Unsigned apps are for local testing. Notarization and store signing are separate steps.' },
  linux: { title: 'Linux', icon: '◇', subtitle: 'Desktop / Steam', description: 'Build on Linux with Rust and the required WebKit/system packages.', help: 'Artifacts depend on the bundle formats in your Tauri configuration. Cross-compilation is not configured.' },
  android: { title: 'Android', icon: '♧', subtitle: 'APK / native project', description: 'Create a debug APK or open the editable Android Studio project. Requires Java, Android SDK/NDK and Rust Android targets.', help: 'Initialize the native project once. Release signing is not configured; release setup belongs in Android Studio. Opening the project starts a development session.' },
  ios: { title: 'iOS', icon: '▯', subtitle: 'Xcode / simulator', description: 'Generate and open an editable Xcode project on your Mac, then build for a simulator or configured device.', help: 'Use Initialize and Open Native Project. Automated iOS archives are intentionally unavailable until signing is configured. Keep the whole game repository alongside Xcode.' }
};
let state, platform = 'web', mode = 'development', dirty = false, selectedJob, lastLog = '', checking = false;
const drafts = new Map();
let artifactKey;
function stashDraft() { if (dirty) drafts.set(`${platform}-${mode}`, draft()); }
const notice = message => { $('#notice').hidden = !message; $('#notice').textContent = message || ''; };
async function api(route, body) {
  const response = await fetch(`/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Export-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data;
}
function draft() { return { platform, mode, ...Object.fromEntries(new FormData($('#profile-form'))) }; }
function updateAvailability() {
  const active = !!state?.active;
  const supportedHost = !({ windows: 'win32', macos: 'darwin', linux: 'linux', ios: 'darwin' }[platform]) || ({ windows: 'win32', macos: 'darwin', linux: 'linux', ios: 'darwin' }[platform]) === state?.project.host;
  const unavailable = platform === 'ios' || (platform === 'android' && mode === 'release');
  $('#build').disabled = $('#run').disabled = active || !supportedHost || unavailable;
  $('#initialize').disabled = $('#open-native').disabled = active || !supportedHost;
  $('#save-profile').disabled = active;
  $('#stop').hidden = !active;
  $('#native-actions').hidden = !['ios', 'android'].includes(platform);
  $('#web-dev-actions').hidden = platform !== 'web';
  $('#dev').disabled = active;
}
function renderProfile() {
  $('#targets').replaceChildren();
  for (const [key, target] of Object.entries(targets)) {
    const button = document.createElement('button'); button.className = `target${key === platform ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(key === platform));
    const icon = document.createElement('span'); icon.className = 'platform-icon'; icon.textContent = target.icon;
    const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = target.title; const sub = document.createElement('small'); sub.textContent = target.subtitle; text.append(title, sub); button.append(icon, text);
    button.addEventListener('click', () => { stashDraft(); platform = key; renderProfile(); void checks(); }); $('#targets').append(button);
  }
  const profile = drafts.get(`${platform}-${mode}`) || state.project.profiles[`${platform}-${mode}`];
  dirty = drafts.has(`${platform}-${mode}`);
  for (const key of ['name', 'version', 'identifier']) $('#profile-form').elements[key].value = profile[key];
  $('#target-title').textContent = targets[platform].title; $('#target-description').textContent = targets[platform].description; $('#target-help').textContent = targets[platform].help;
  $('#profile-status').textContent = mode === 'development' ? 'Development' : 'Release';
  $('#output-location').textContent = `Builds/${platform}/${mode}/<build-id>/`;
  $('#saved-state').textContent = dirty ? 'Unsaved changes' : 'Saved profile / defaults';
  for (const button of document.querySelectorAll('[data-mode]')) { button.classList.toggle('selected', button.dataset.mode === mode); button.setAttribute('aria-pressed', String(button.dataset.mode === mode)); }
  updateAvailability();
}
async function checks() {
  if (checking) return;
  checking = true; $('#check').disabled = true; const target = platform;
  try {
    const result = await api('check', { platform: target });
    if (platform !== target) return;
    $('#checks').replaceChildren();
    for (const check of result.checks) {
      const item = document.createElement('div'); item.className = `check-item${check.ok ? '' : ' missing'}`;
      const icon = document.createElement('span'); icon.className = 'check-icon'; icon.textContent = check.ok ? '✓' : '○';
      const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = check.name; const detail = document.createElement('p'); detail.textContent = check.detail; text.append(title, detail); item.append(icon, text); $('#checks').append(item);
    }
    $('#check-note').textContent = result.note;
  } catch (error) { notice(error.message); }
  finally { checking = false; $('#check').disabled = false; if (platform !== target) void checks(); }
}
function renderJob() {
  const job = state.jobs.find(job => job.id === selectedJob) || state.jobs.at(-1);
  if (!job) return;
  $('#job-status').textContent = job.status;
  $('#dev-session').hidden = job.action !== 'dev' || job.status !== 'running';
  $('#dev-status').textContent = job.devUrl ? 'Dev server running · source changes update live' : 'Starting dev server…';
  $('#dev-link').hidden = !job.devUrl || job.status !== 'running';
  if (job.devUrl) $('#dev-link').href = job.devUrl;
  const text = job.log || 'Checking build prerequisites…';
  if (text !== lastLog) { const pinned = $('#log').scrollTop + $('#log').clientHeight >= $('#log').scrollHeight - 40; $('#log').textContent = text; if (pinned) $('#log').scrollTop = $('#log').scrollHeight; lastLog = text; }
  $('#artifacts').hidden = !job.output;
  if (job.output && artifactKey !== job.id) {
    artifactKey = job.id;
    $('#artifacts').replaceChildren(); const label = document.createElement('div'); label.textContent = `Output · ${job.output.directory}`; $('#artifacts').append(label);
    const reveal = document.createElement('button'); reveal.className = 'text-button'; reveal.textContent = 'Open output folder ↗'; reveal.onclick = () => api('reveal', { id: job.id }).catch(error => notice(error.message)); $('#artifacts').append(reveal);
    if (job.profile.platform === 'web') { const preview = document.createElement('a'); preview.href = `/preview/${job.id}/`; preview.target = '_blank'; preview.rel = 'noopener'; preview.textContent = 'Open web preview ↗'; $('#artifacts').append(preview); }
    for (const artifact of job.output.artifacts.filter(file => !file.directory)) { const link = document.createElement('a'); link.href = `/artifact/${job.id}/${encodeURIComponent(artifact.name)}`; link.textContent = `${artifact.name} · ${(artifact.bytes / 1048576).toFixed(1)} MB`; $('#artifacts').append(link); }
  }
}
async function refresh() { state = await api('state'); $('#project-name').textContent = state.project.name; $('#project-path').textContent = state.project.root; $('#host').textContent = { win32: 'Windows workstation', darwin: 'Mac workstation', linux: 'Linux workstation' }[state.project.host] || state.project.host; renderJob(); updateAvailability(); }
async function start(action) {
  try {
    notice(''); const profile = draft();
    if (!$('#profile-form').reportValidity()) return;
    await api('profile', profile); drafts.delete(`${platform}-${mode}`); dirty = false; $('#saved-state').textContent = 'Profile saved';
    const result = await api('start', { profile, action }); selectedJob = result.id; lastLog = ''; $('#artifacts').hidden = true; await refresh();
  } catch (error) { notice(error.message); }
}
$('#profile-form').addEventListener('input', () => { dirty = true; $('#saved-state').textContent = 'Unsaved changes'; });
$('#profile-form').addEventListener('submit', async event => { event.preventDefault(); try { const profile = await api('profile', draft()); state.project.profiles[`${platform}-${mode}`] = profile; drafts.delete(`${platform}-${mode}`); dirty = false; $('#saved-state').textContent = 'Profile saved'; notice(''); } catch (error) { notice(error.message); } });
for (const button of document.querySelectorAll('[data-mode]')) button.onclick = () => { stashDraft(); mode = button.dataset.mode; renderProfile(); };
$('#build').onclick = () => start('build'); $('#run').onclick = () => start('run'); $('#initialize').onclick = () => start('initialize'); $('#open-native').onclick = () => start('open');
$('#dev').onclick = () => start('dev');
$('#check').onclick = checks; $('#stop').onclick = () => api('stop', {}).catch(error => notice(error.message));
$('#copy-log').onclick = () => navigator.clipboard.writeText($('#log').textContent).catch(() => notice('Select and copy the log text manually.'));
window.addEventListener('beforeunload', event => { if (dirty || drafts.size) { event.preventDefault(); event.returnValue = ''; } });
try { await refresh(); renderProfile(); void checks(); } catch (error) { notice(error.message); }
setInterval(() => { void refresh().catch(() => notice('Dashboard disconnected. Restart npm run export:ui and reload.')); }, 1000);
