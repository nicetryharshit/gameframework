import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

export type DisplayMode = 'fullscreen' | 'windowed' | 'borderless';
export interface DesktopControls {
  apply(mode: DisplayMode, width: number, height: number): Promise<void>;
  quit(): Promise<void>;
}
/** Native window controls are optional and only available in the desktop shell. */
export async function createDesktopControls(): Promise<DesktopControls | undefined> {
  if (!isTauri() || await invoke<string>('platform_kind') !== 'desktop') return undefined;
  const window = getCurrentWindow();
  return {
    async apply(mode, width, height) {
      const fullscreen = await window.isFullscreen();
      if (mode !== 'fullscreen' && fullscreen) await window.setFullscreen(false);
      await window.setDecorations(mode === 'windowed');
      if (mode === 'fullscreen') { if (!fullscreen) await window.setFullscreen(true); }
      else { await window.setSize(new LogicalSize(width, height)); await window.center(); }
    },
    quit: () => window.close()
  };
}

export interface SteamControls {
  /** True when this build includes Steam and the Steam client is running. */
  available(): Promise<boolean>;
  /** Unlocks an achievement by its Steamworks API name. Resolves to false if Steam cannot do it. */
  unlockAchievement(name: string): Promise<boolean>;
  /** Sets an integer stat by its Steamworks API name. Resolves to false if Steam cannot do it. */
  setStat(name: string, value: number): Promise<boolean>;
}

async function steamCall(command: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    await invoke(command, args);
    return true;
  } catch (error) {
    // Steam is optional: a game keeps running without it, so a failed call is reported and skipped.
    console.warn(`Steam: ${command} did not complete: ${String(error)}`);
    return false;
  }
}

/** Steam achievements and stats. Only available in the desktop app; undefined on web and mobile. */
export async function createSteamControls(): Promise<SteamControls | undefined> {
  if (!isTauri() || await invoke<string>('platform_kind') !== 'desktop') return undefined;
  return {
    available: () => invoke<boolean>('steam_available'),
    unlockAchievement: name => steamCall('steam_unlock_achievement', { name }),
    setStat: (name, value) => steamCall('steam_set_stat_i32', { name, value })
  };
}

/** Steam test panel: a debug-only way to try achievements and stats before the game has its own screens. */
// Names from the Steamworks SpaceWar example (App ID 480). Replace them with your own once your app exists.
export const STEAM_TEST_ACHIEVEMENT = 'ACH_WIN_ONE_GAME';
export const STEAM_TEST_STAT = 'NumGames';

/** True for dev runs and for debug builds made by Game Workshop, which sets VITE_GAME_DEBUG_BUILD. Never true in release. */
export function isDebugBuild(): boolean {
  const env = import.meta.env;
  return env?.MODE === 'development' || env?.VITE_GAME_DEBUG_BUILD === '1';
}

/** Shows a small Steam test panel in the corner of the game. Does nothing in release builds. */
export async function mountSteamTestPanel(): Promise<void> {
  if (!isDebugBuild() || typeof document === 'undefined' || document.getElementById('steam-test')) return;
  const panel = document.createElement('div');
  panel.id = 'steam-test';
  panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;background:#fff;color:#222;font:12px monospace;padding:10px;border:1px solid #888;border-radius:6px;width:260px;display:grid;gap:6px';
  const title = document.createElement('strong');
  title.textContent = 'Steam test (debug build only)';
  const status = document.createElement('div');
  status.textContent = 'Steam: checking…';
  const unlock = document.createElement('button');
  unlock.textContent = `Unlock ${STEAM_TEST_ACHIEVEMENT}`;
  const stat = document.createElement('button');
  stat.textContent = `Set ${STEAM_TEST_STAT} to 5`;
  const log = document.createElement('div');
  log.style.whiteSpace = 'pre-wrap';
  panel.append(title, status, unlock, stat, log);
  document.body.append(panel);

  const steam = await createSteamControls().catch(() => undefined);
  if (!steam) {
    status.textContent = 'Steam: not in this build (web or mobile)';
    unlock.disabled = stat.disabled = true;
    return;
  }
  const running = await steam.available().catch(() => false);
  status.textContent = running
    ? 'Steam: connected'
    : 'Steam: not connected. Is the Steam client running, and is this a build with Steam turned on?';
  unlock.disabled = stat.disabled = !running;
  unlock.addEventListener('click', async () => {
    log.textContent = await steam.unlockAchievement(STEAM_TEST_ACHIEVEMENT)
      ? `Unlocked ${STEAM_TEST_ACHIEVEMENT}. Steam shows a pop-up the first time.`
      : `Could not unlock ${STEAM_TEST_ACHIEVEMENT}. Is it defined for this App ID? See the console.`;
  });
  stat.addEventListener('click', async () => {
    log.textContent = await steam.setStat(STEAM_TEST_STAT, 5)
      ? `Set ${STEAM_TEST_STAT} to 5.`
      : `Could not set ${STEAM_TEST_STAT}. Is it defined for this App ID?`;
  });
}
