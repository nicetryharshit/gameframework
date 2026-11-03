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
