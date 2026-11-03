import { VersionedSaveStore } from './storage';
export interface GameSettings { master: number; music: number; effects: number; muted: boolean }
export const defaultSettings: Readonly<GameSettings> = Object.freeze({ master: 1, music: 0.7, effects: 1, muted: false });
export interface GamePreferences extends GameSettings {
  displayMode: 'fullscreen' | 'windowed' | 'borderless';
  windowSize: '960x540' | '1280x720' | '1920x1080';
  frameLimit: 0 | 30 | 60 | 120;
  renderScale: 0.75 | 1 | 2;
}
export const defaultPreferences: Readonly<GamePreferences> = Object.freeze({ ...defaultSettings, displayMode: 'fullscreen', windowSize: '1280x720', frameLimit: 60, renderScale: 1 });
export function createPreferencesStore(namespace: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): VersionedSaveStore<GamePreferences> {
  return new VersionedSaveStore(namespace, {
    version: 1,
    validate(value): value is GamePreferences {
      if (!value || typeof value !== 'object') return false;
      const p = value as GamePreferences;
      return typeof p.muted === 'boolean' && [p.master, p.music, p.effects].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
        && ['fullscreen', 'windowed', 'borderless'].includes(p.displayMode) && ['960x540', '1280x720', '1920x1080'].includes(p.windowSize)
        && [0, 30, 60, 120].includes(p.frameLimit) && [0.75, 1, 2].includes(p.renderScale);
    }
  }, storage);
}
export function createSettingsStore(namespace: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): VersionedSaveStore<GameSettings> {
  return new VersionedSaveStore(namespace, {
    version: 1,
    validate(value): value is GameSettings {
      if (!value || typeof value !== 'object') return false;
      const settings = value as GameSettings;
      return typeof settings.muted === 'boolean' && [settings.master, settings.music, settings.effects].every(v => Number.isFinite(v) && v >= 0 && v <= 1);
    }
  }, storage);
}
