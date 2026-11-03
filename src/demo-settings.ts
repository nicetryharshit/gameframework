import { AudioMixer, createPreferencesStore, defaultPreferences, type GamePreferences, type Input } from './framework';
import { createDesktopControls, type DesktopControls } from './platform/desktop';

/** Removable example settings UI; storage, audio and window controls stay reusable. */
export async function createGameOptions() {
  const element = document.createElement('section');
  element.className = 'options-panel';
  element.innerHTML = `<h2>Settings</h2><div class="desktop-options" hidden>
    <label>Display mode<select name="displayMode"><option value="fullscreen">Fullscreen</option><option value="windowed">Windowed</option><option value="borderless">Borderless window</option></select></label>
    <label>Window size<select name="windowSize"><option>960x540</option><option>1280x720</option><option>1920x1080</option></select></label></div>
    <label>Frame limit<select name="frameLimit"><option value="0">Display refresh rate</option><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="120">120 FPS</option></select></label>
    <label>Render quality<select name="renderScale"><option value="0.75">Performance</option><option value="1">Balanced</option><option value="2">High DPI</option></select></label>
    <label>Master volume<input name="master" type="range" min="0" max="1" step="0.05"></label>
    <label>Music volume<input name="music" type="range" min="0" max="1" step="0.05"></label>
    <label>Effects volume<input name="effects" type="range" min="0" max="1" step="0.05"></label>
    <label>Mute<input name="muted" type="checkbox"></label>
    <p class="options-status" role="status"></p><button data-options="apply">Apply</button><button data-options="reset" class="secondary">Restore defaults</button><button data-action="back" class="secondary">Back</button>`;
  const status = element.querySelector<HTMLElement>('.options-status')!;
  let preferences: GamePreferences = { ...defaultPreferences };
  let store: ReturnType<typeof createPreferencesStore> | undefined;
  let desktop: DesktopControls | undefined;
  let mixer: AudioMixer | undefined;
  let disposed = false;
  let busy = false;
  let onApply: (value: GamePreferences) => void = () => {};
  try {
    store = createPreferencesStore('pocket-flight', localStorage);
    const loaded = store.load('preferences');
    if (loaded.ok) preferences = loaded.value ?? preferences;
    else { store = undefined; status.textContent = 'Settings could not be loaded; using session defaults.'; }
  } catch { status.textContent = 'Settings will last for this session.'; }
  try { desktop = await createDesktopControls(); }
  catch { status.textContent = 'Desktop controls are unavailable. Check the native wrapper version.'; }
  (element.querySelector('.desktop-options') as HTMLElement).hidden = !desktop;
  const audioVolumes = () => {
    mixer?.setVolume('master', preferences.muted ? 0 : preferences.master);
    mixer?.setVolume('music', preferences.music); mixer?.setVolume('effects', preferences.effects);
  };
  const fill = (value = preferences) => {
    for (const [key, val] of Object.entries(value)) {
      const control = element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`)!;
      if (control.tagName === 'INPUT' && control.type === 'checkbox') (control as HTMLInputElement).checked = Boolean(val);
      else control.value = String(val);
    }
    (element.querySelector('[name="windowSize"]') as HTMLSelectElement).disabled = value.displayMode === 'fullscreen';
  };
  const read = (): GamePreferences => {
    const value = { ...preferences };
    for (const key of Object.keys(value) as (keyof GamePreferences)[]) {
      const control = element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`)!;
      const parsed = key === 'muted' ? (control as HTMLInputElement).checked : ['master', 'music', 'effects', 'frameLimit', 'renderScale'].includes(key) ? Number(control.value) : control.value;
      Object.assign(value, { [key]: parsed });
    }
    return value;
  };
  const apply = async (value: GamePreferences) => {
    if (busy || disposed) return;
    busy = true;
    const previous = preferences;
    try {
      const [width, height] = value.windowSize.split('x').map(Number);
      if (desktop) await desktop.apply(value.displayMode, width, height);
      if (disposed) return;
      preferences = value; audioVolumes(); onApply(preferences); fill();
      const saved = store?.save('preferences', preferences);
      status.textContent = saved?.ok ? 'Settings saved.' : 'Applied for this session; settings could not be saved.';
    } catch (error) {
      status.textContent = 'Could not apply display settings. Previous settings restored.';
      if (desktop) { const [w, h] = previous.windowSize.split('x').map(Number); await desktop.apply(previous.displayMode, w, h).catch(() => {}); }
      fill(previous); console.error(error);
    } finally { busy = false; }
  };
  const listeners = new AbortController();
  element.addEventListener('change', () => { (element.querySelector('[name="windowSize"]') as HTMLSelectElement).disabled = read().displayMode === 'fullscreen'; }, { signal: listeners.signal });
  element.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-options]')?.dataset.options;
    if (action === 'apply') void apply(read());
    if (action === 'reset') fill({ ...defaultPreferences });
  }, { signal: listeners.signal });
  fill();
  return {
    element, desktop,
    get preferences() { return preferences; },
    show: () => { fill(); element.querySelector<HTMLElement>(desktop ? '[name="displayMode"]' : '[name="frameLimit"]')?.focus(); },
    async initialize(callback: (value: GamePreferences) => void) { onApply = callback; await apply(preferences); },
    async toggleFullscreen() { await apply({ ...preferences, displayMode: preferences.displayMode === 'fullscreen' ? 'windowed' : 'fullscreen' }); },
    unlock() {
      if (disposed) return;
      try {
        if (!mixer) {
          const context = new AudioContext(); mixer = new AudioMixer(context); audioVolumes();
          for (const [name, frequency] of [['flap', 520], ['score', 880], ['crash', 140]] as const) {
            const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.08), context.sampleRate);
            const samples = buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * frequency * i / context.sampleRate) * (1 - i / samples.length) * 0.12;
            mixer.setBuffer(name, buffer);
          }
        }
        void mixer.unlock().catch(() => {});
      } catch { /* Audio is optional when unavailable. */ }
    },
    sound(name: string) { mixer?.play(name); },
    suspend() { void mixer?.suspend().catch(() => {}); },
    navigate(input: Input) {
      const control = document.activeElement as HTMLInputElement | HTMLSelectElement;
      const direction = Number(input.pressed('menuRight')) - Number(input.pressed('menuLeft'));
      if (!direction || !element.contains(control)) return;
      if (control.tagName === 'SELECT') { const select = control as HTMLSelectElement; select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction)); }
      else if (control.type === 'range') control.value = String(Math.max(0, Math.min(1, Number(control.value) + direction * 0.05)));
      else if (control.type === 'checkbox') (control as HTMLInputElement).checked = !(control as HTMLInputElement).checked;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    },
    dispose() { disposed = true; listeners.abort(); void mixer?.dispose().catch(() => {}); }
  };
}
